# Westwood Studios, EA & OpenRA — Development Philosophy and Lessons

> A compilation of publicly-stated design principles, development methods, and lessons from the original creators of Command & Conquer and the community that carried their work forward. Sourced from interviews, GDC talks, community engagement, project documentation, and the GPL-released source code. Iron Curtain aims to follow in their footsteps — every principle below maps to a concrete IC decision or practice.

## Key People

### Westwood Studios & EA

| Name               | Role                                | Studio                             | Primary Contribution                                                                                  |
| ------------------ | ----------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Joe Bostic**     | Lead Programmer & Gameplay Designer | Westwood Studios, Petroglyph Games | Created Dune II and C&C gameplay systems; OutList/DoList order architecture; integer math determinism |
| **Brett Sperry**   | Co-founder                          | Westwood Studios                   | RTS genre co-creator; gameplay direction; protected studio culture from corporate pressure            |
| **Louis Castle**   | Co-founder                          | Westwood Studios                   | Visual identity; AI design philosophy; industry advocacy (multiple GDC talks)                         |
| **Jim Vessella**   | Producer                            | EA (C&C Remastered)                | Community-first development; championed GPL source release; Community Council model                   |
| **Frank Klepacki** | Composer & Audio Director           | Westwood Studios, Petroglyph       | Defined the C&C audio identity; encouraged to experiment across genres; "Hell March"                  |
| **Mike Legg**      | Programmer & Designer               | Westwood Studios, Petroglyph       | Kyrandia designer; shared code library architect; 17 years at Westwood (1986–2003)                    |
| **Denzil Long**    | Software Engineer                   | Westwood Studios                   | Dune 2 ports; C&C video streaming system; quality culture advocate                                    |
| **Steve Tall**     | Programmer                          | Petroglyph Games                   | Remastered Collection code contributor; maintained original codebase knowledge                        |
| **Joe Kucan**      | Actor & Director                    | Westwood Studios                   | Kane; directed FMV sequences; embodied DIY production culture                                         |

### OpenRA

| Name                                  | Role                         | Primary Contribution                                                                               |
| ------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------- |
| **Paul Chote** (`pchote`)             | Lead Maintainer (~2013–2021) | Primary project voice; authored coding standard; EA/Petroglyph liaison for Remastered; blog author |
| **Chris Forbes** (`chrisforbes`)      | Early Core Developer         | Architecture documentation ("Hacking" wiki); coding standard co-author; founding-era contributor   |
| **PunkPun** (Gustas Kažukauskas)      | Current Active Maintainer    | All blog posts from 2022 onward; wiki maintenance; current project stewardship                     |
| **Matthias Mailänder** (`Mailaender`) | Core Developer               | CONTRIBUTING.md co-author; FAQ editor; long-term contributor                                       |

## Sources

### Westwood / EA Sources

| Source                                                                                            | Type         | Date      | Key Content                                                                                                     |
| ------------------------------------------------------------------------------------------------- | ------------ | --------- | --------------------------------------------------------------------------------------------------------------- |
| [Joe Bostic — Arcade Attack Interview](https://www.arcadeattack.co.uk/joe-bostic/)                | Interview    | Aug 2018  | Dune II origins, C&C design philosophy, Westwood culture, EA acquisition impact                                 |
| [Joe Bostic — C&C Remastered Interview](https://www.arcadeattack.co.uk/joe-bostic-cc-remastered/) | Interview    | Jul 2020  | Remaster philosophy, code durability, QoL vs remake distinction                                                 |
| [Frank Klepacki — Arcade Attack Interview](https://www.arcadeattack.co.uk/frank-klepacki/)        | Interview    | Jan 2017  | Audio creative process, experimentation philosophy, working culture                                             |
| [Mike Legg — Arcade Attack Interview](https://www.arcadeattack.co.uk/mike-legg/)                  | Interview    | Apr 2019  | Westwood culture, shared code library, scope management, organic design                                         |
| [Denzil Long — Arcade Attack Interview](https://www.arcadeattack.co.uk/denzil-long/)              | Interview    | Sep 2018  | Quality culture, team dynamics, play session methodology, humility in engineering                               |
| [Louis Castle — Ars Technica: "War Stories"](https://www.youtube.com/watch?v=S-VAL7Epn3o)         | Video        | Feb 2019  | Pathfinding heuristics ("Artificial Idiocy"), no unit caps, CD-ROM streaming tech                               |
| [Wikipedia — Westwood Studios](https://en.wikipedia.org/wiki/Westwood_Studios)                    | Encyclopedia | —         | EA non-interference (initially), corporate culture separation                                                   |
| Louis Castle — GDC 1997: "1996 Developer Spotlight"                                               | GDC Talk     | 1997      | [GDC Vault](https://gdcvault.com/play/1014856/1996-Developer)                                                   |
| Louis Castle — GDC 1997: "Apparent Intelligence or Inanimate Objects Make Good Friends"           | GDC Talk     | 1997      | AI design philosophy; [GDC Vault](https://gdcvault.com/play/1015183/Apparent-Intelligence-or-Inanimate-Objects) |
| Louis Castle — GDC 1998: "Blade Runner: Soup to Nuts!"                                            | GDC Talk     | 1998      | Narrative game production; [GDC Vault](https://gdcvault.com/play/1014254/Blade-Runner-Soup-to-Nuts)             |
| Jim Vessella — EA Community Updates                                                               | Blog Series  | 2018–2020 | 20+ development updates on C&C Remastered; Community Council formation                                          |
| Jim Vessella — Reddit AMA                                                                         | Reddit       | May 2020  | Community engagement, design decisions for Remastered                                                           |
| EA — GPL Source Releases                                                                          | Source Code  | 2020–2025 | Red Alert, Tiberian Dawn, Generals/Zero Hour, Remastered Collection                                             |
| *Computer Gaming World* — "Westwood Studios Partnership Hits Jackpot"                             | Magazine     | Aug 1993  | Reputation for shipping on time, quality consistency                                                            |

### OpenRA Sources

| Source                                                                                        | Type      | Date     | Key Content                                                                       |
| --------------------------------------------------------------------------------------------- | --------- | -------- | --------------------------------------------------------------------------------- |
| [OpenRA — Development Goals Wiki](https://github.com/OpenRA/OpenRA/wiki/Development-Goals)    | Wiki      | Dec 2019 | Two mission goals, per-mod philosophy, volunteer development model                |
| [OpenRA — FAQ Wiki](https://github.com/OpenRA/OpenRA/wiki/FAQ)                                | Wiki      | —        | "Not a clone" philosophy, clean-room implementation, intentional modernization    |
| [OpenRA — Hacking Wiki](https://github.com/OpenRA/OpenRA/wiki/Hacking)                        | Wiki      | —        | Trait system architecture, composition-over-inheritance, engine design philosophy |
| [OpenRA — Coding Standard Wiki](https://github.com/OpenRA/OpenRA/wiki/Coding-Standard)        | Wiki      | —        | Pragmatic anti-boilerplate coding philosophy                                      |
| [OpenRA — Contributing / Reviewing Wikis](https://github.com/OpenRA/OpenRA/wiki/Contributing) | Wiki      | —        | 2-reviewer minimum, community governance, release process                         |
| [Paul Chote — Devblog June 2018](https://www.openra.net/news/devblog-20180610/)               | Blog Post | Jun 2018 | "Original vs Modern" balance tension, community input on design direction         |
| [Paul Chote — Devblog June 2020](https://www.openra.net/news/devblog-20200629/)               | Blog Post | Jun 2020 | OpenRA vs Remastered philosophy, explicit differentiation, EA relationship        |
| [OpenRA — EA Announcement](https://www.openra.net/news/special-announcement/)                 | Blog Post | Oct 2018 | Community Council participation, EA relationship, GPL advocacy                    |
| [OpenRA — About Page](https://www.openra.net/about/)                                          | Website   | —        | Project identity, modding philosophy, per-mod design approaches                   |

---

## Part 1: Their Principles (What They Said)

### 1. Small Teams, Great Passion

> "The magic to creating those games was probably due to small teams with great passion. In those days, the lead programmer had a big, and often primary, influence on the game's design which led to a measure of consistency."
>
> — **Joe Bostic**, 2018

Westwood's early C&C team was small enough that the lead programmer was also the lead designer. This wasn't a limitation — it was the source of their consistency. One person held the full technical and design vision simultaneously.

**IC Application:** Iron Curtain is a small-team project. The architecture reflects a single coherent vision rather than committee design. Technical and design decisions are documented together in the same design docs (not split into separate "tech spec" and "design doc" silos). The person writing the systems understands *why* each system exists.

### 2. Iterate, Don't Spec Everything Upfront

> "There wasn't an exact vision of the final product when we first started. We came up with ideas as the development progressed. For example, we knew from the start that the game had to play in real-time, unlike other military games of the day which were turn-based, but the idea of harvesting to gain credits to purchase more units was thought of in the middle of development."
>
> — **Joe Bostic** on Dune II development, 2018

The RTS genre wasn't designed on paper and then built. It was discovered through building. Core mechanics (real-time play) were fixed early; secondary systems (resource harvesting) emerged during development.

**IC Application:** IC has fixed architectural invariants (deterministic sim, no floats, pluggable networking) that will not change. But specific game systems will be refined through implementation. The phased roadmap (08-ROADMAP.md) intentionally leaves room for iteration within each phase while locking down the invariants that everything else depends on.

### 3. Fun Is the Filter

> "We were free to come up with crazy new ideas for units and added them in if they felt like fun. Pretty soon, there were so many new things added to the game that it was decided to package it as a new stand-alone game — Red Alert."
>
> — **Joe Bostic** on Red Alert's origins, 2018

> "You like the idea that people could build tons of units and go marching across the world and just mow everything down. That was lots of fun."
>
> — **Louis Castle** on rejecting unit caps, 2019

Red Alert started as a C&C expansion pack. The team kept adding ideas that felt fun until it outgrew its original scope. Louis Castle explicitly contrasted C&C with competitors like Warcraft, noting that while unit caps might have made technical sense, removing them made the game fun. The filter was never "does this fit the design doc?" — it was "is this fun?"

**IC Application:** While IC has thorough design documentation, the documents serve the game, not the other way around. If something plays well but wasn't in the docs, update the docs. If something is in the docs but plays poorly, cut it. D019 (switchable balance presets) and D033 (toggleable QoL presets) explicitly enable this — players and modders can experiment with what's fun.

### 4. Make It Relatable

> "After Dune 2, I came up with the idea of using this new RTS gameplay but set in a fantasy world. It would have three factions — the humans, medieval style fantasy knights, the wizards, and beasts. At the time, the first gulf war was taking place and Brett Sperry thought that using a modern military theme would make the game more relatable to the public. Thus the fantasy idea was dropped and the result was the modern military theme of Command & Conquer."
>
> — **Joe Bostic**, 2018

Brett Sperry redirected C&C from fantasy to modern military because relatability matters more than the designer's first preference. The gameplay was the same — the theme was what players could connect with.

**IC Application:** IC prioritizes compatibility with the existing C&C community's assets and expectations (D023 vocabulary compatibility, D024 Lua API superset, D025 runtime MiniYAML). We meet players where they are, not where we wish they were.

### 5. The Core Fantasy

> "The core idea behind the RTS genre was to recreate the imaginary combat I had in my head while playing with toy soldiers in a sandbox as a child. I imagined what it would be like if the soldiers and tanks were not just inert pieces of plastic, but actually were fighting. This is the root of the RTS genre that guided me."
>
> — **Joe Bostic**, 2018

> "We start off Command & Conquer one with this idea that as a kid in your bedroom with a computer and a modem you were hacking into or becoming a remote commander of a battlefield... the idea that the screen would be fullscreen audio/video was kind of a necessity because it was supposed to be tying into a real feed with a real person somewhere."
>
> — **Louis Castle**, 2019

The entire RTS genre emerged from a specific, personal fantasy: toy soldiers coming alive, or a hacker intervening in a live battlefield. This isn't abstract — it's visceral and specific. Every design decision at Westwood was measured against whether it served this fantasy.

**IC Application:** Iron Curtain must never lose sight of this core fantasy. Advanced features (LLM missions, WASM mods, relay servers, competitive infrastructure) are in service of the sandbox — not the other way around. When evaluating a feature, ask: "Does this make the toy soldiers feel more alive?"

### 6. Teach Yourself What You Don't Know

> "We wanted to do videos between missions, but we had no experience with movies or television. We had to teach ourselves or look around for local expertise. However, we did hire a Las Vegas local, Joe Kucan, as he had community theater experience and would serve as the director for the talent during video shoots. It turned out that he was a good fit as the villain and the rest is history. The other cast members were local talent and even other Westwood employees. It was all very wild west back in those days."
>
> — **Joe Bostic**, 2018

C&C's iconic FMV sequences — one of the most distinctive features in all of gaming — were created by a team with zero film experience, hiring local community theater talent. They didn't wait until they had the "right" experience. They figured it out.

**IC Application:** IC is a Rust/Bevy RTS engine built by people who believe in learning by building. The design docs exist to organize what we're learning, not to pretend we already know everything. When we encounter a domain we haven't mastered (GPU rendering, competitive netcode, mod sandboxing), we study the best prior art (25+ open-source games analyzed), then build and iterate.

### 7. Protect the Culture

> "When EA acquired Westwood, there was very little disruption. I credit Brett Sperry (co-owner of Westwood) for being a champion of keeping the corporate culture of EA separate from Westwood's culture. This was key as it allowed us to continue to work as we always had."
>
> — **Joe Bostic**, 2018

> "The Westwood of 2003 however, was very different. At that time, Westwood had eventually succumbed to the corporate 'every game must be a big hit' mentality and that affected the size of the projects as well as the internal culture. This shift from passion to profit took its toll."
>
> — **Joe Bostic**, 2018

Westwood's best work came when they were shielded from corporate pressure. When that shield fell, the culture changed, the games suffered, and the studio closed. The lesson: culture isn't a nice-to-have. It's the thing that makes the work good.

**IC Application:** Iron Curtain is open-source and community-driven by design. There is no corporate pressure to shield from — but there are analogous threats: scope creep, premature optimization, feature envy, "every feature must ship." The project's invariants (AGENTS.md) and phased roadmap serve the same purpose Brett Sperry did: protecting the core focus from well-intentioned distractions.

### 8. Ship On Time, Ship Quality

> "Many publishers would assure [us] that a project was going to be completed on time because Westwood was doing it. [Westwood] not only has a solid reputation for getting product out on time, but a reputation for good product."
>
> — *Computer Gaming World*, August 1993

By 1993, Westwood had a reputation that most studios never achieve: reliable shipping *and* quality. These are usually seen as trade-offs. Westwood proved they don't have to be.

**IC Application:** The 36-month phased roadmap has specific exit criteria for each phase. Phases don't ship until criteria are met, but there's also no infinite polishing. D028 (condition & multiplier systems are Phase 2 hard requirements) is an example: it defines what "done" means for Phase 2, neither more nor less.

### 9. Constraints Drive Innovation

Joe Bostic on why C&C exists:

> "We only had limited access to the [Dune] license — it was derived from the movie license and had time limit for exploitation in addition to the usual financial burdens with using a license. These reasons led us to pursue a different path and thus we created the Command & Conquer series."
>
> — **Joe Bostic**, 2018

The Dune license limitations didn't kill the RTS genre — they gave birth to C&C. Constraints forced creativity.

**IC Application:** IC's constraints are deliberate: no floats in sim (D009), no C# ever, Bevy ECS only (D004), YAML not MiniYAML (D003). These aren't arbitrary limitations — they're creative forcing functions. When a design doesn't fit within the constraints, the constraint forces a better solution (just as losing the Dune license forced Bostic and Sperry to create something more original).

### 10. Remaster, Don't Remake

> "We wanted to improve the game with some QoL (quality of life) features, but the main factor driving those decisions was that we were making a 'remaster', not a 'remake'. Players should be able to play the same experience they did when the games were originally released. The biggest changes were in the rendering and network code which, naturally, needed complete overhaul to bring the remasters to the present day."
>
> — **Joe Bostic** on C&C Remastered, 2020

The Remastered team drew a clear line: improve presentation and infrastructure, preserve gameplay. Players' memories and muscle memory are sacred.

**IC Application:** IC takes this further with D019 (switchable balance presets): Classic RA balance is the default, preserving the original feel. OpenRA and Remastered balance are available as options. The rendering and networking are modern (Bevy, relay server, sub-tick ordering), but the simulation — the thing players actually *play* — respects the original when the player wants it to. D023 (OpenRA vocabulary compatibility) and D024 (Lua API superset) apply the same principle: existing mods and mission scripts should just work.

### 11. Code Should Outlast You

> "It was nice to see the old code still hold up pretty well considering the C++ standard hadn't even been finalized when we wrote the original game. We didn't have to do much alteration of the original code except to replace the rendering and networking layers. It was fun to see comments in the code written 25 years ago and still remembering the thought process behind the internal game design."
>
> — **Joe Bostic** on revisiting the RA codebase, 2020

25-year-old code, written before C++ was even standardized, still worked well enough to remaster. The sim layer was sound — only the I/O layers (rendering, networking) needed replacement. This is extraordinary engineering.

**IC Application:** This is possibly the single most important validation of IC's architecture. Our sim/render/net split (Invariant #1, #2, #9) mirrors exactly what Westwood got right: the simulation is pure and portable, the I/O layers are replaceable. When IC's rendering needs to change in 10 years, the sim won't need to change. When the networking needs to change, the sim won't need to change. Bostic's experience proves this architecture survives decades.

### 12. Indie Studios Are the True Innovators

> "I see indie studios as the true innovators in the game industry."
>
> — **Joe Bostic**, 2018

> "Petroglyph is always trying new things and experimenting with game ideas. That is one advantage of being a small indie studio — we don't have to always create 'safe' games and can take more design risks."
>
> — **Joe Bostic**, 2020

After decades in the industry — from founding Westwood through the EA acquisition through founding Petroglyph — Bostic's conclusion is clear: small independent teams produce the best innovation.

**IC Application:** Iron Curtain is an indie, open-source project. We can take risks that a publisher-funded studio cannot: open-sourcing everything, building an engine instead of porting OpenRA, targeting WASM/mobile, supporting LLM-generated missions, making modding a first-class concern. Every risk we take is one a corporate studio would reject as "not safe."

---

## Part 2: Their Game Development Approach

These principles focus on how Westwood approached game design specifically — the creative process, audio, team dynamics, scope, and playtesting. Where Part 1 covers high-level philosophy, this section covers how they actually made games.

### Encourage Experimentation in Every Discipline

> "The most important thing I can stress about that process was that I was encouraged to experiment and tap into a wide variety of influences. That in itself allowed for me to stretch as far as I wanted in any direction and see what worked well and what didn't."
>
> — **Frank Klepacki** on composing the C&C soundtrack, 2017

Klepacki didn't receive a brief that said "write military rock." He was given *freedom to explore* — thrash metal, electronic, ambient, "even rollerskate music." The result was one of the most distinctive game soundtracks ever made. By Red Alert, there was "a feeling of honing in on style, so it was more refined from that point forward." Style emerged from experimentation, not from a spec.

**IC Application:** Audio design (Phase 3, `ic-audio`) should follow the same pattern. Start broad, experiment with how different audio styles feel against the gameplay, then refine. The modding tier system (D003/D004/D005) extends this philosophy to the community — modders should be able to experiment with every aspect of the game, not just units and balance.

### Write Good Work First, Adapt It Later

> "I believe first and foremost I should write good music first that I'm happy with and figure out how to adapt it later if there's some specific way that is required."
>
> — **Frank Klepacki**, 2017

Klepacki's creative process prioritizes quality over implementation constraints. He writes the music he believes in, then adapts it to technical requirements — not the other way around. This is the audio equivalent of Bostic's "fun is the filter."

**IC Application:** When building game systems, build the best version first, then optimize. Don't pre-optimize into mediocrity. The performance pyramid (10-PERFORMANCE.md) supports this: get the algorithm right first, then worry about cache layout and allocation patterns. Design for correctness, then adapt for constraints.

### Playtest Constantly — The Hallway Method

> "We had regular internal play sessions, where afterward, the team would gather in the halls to excitedly discuss what we liked and disliked. This almost always resulted in 'it would be cool if…' conversations. Some of the best ideas came from those informal discussions."
>
> — **Denzil Long**, 2018

The best C&C ideas didn't come from design documents — they came from playing the game and then talking about it in the hallway. This was a structured but organic feedback loop: play → discuss → iterate. The key detail: they played *during development*, not just at milestones.

> "I remember the first C&C very clearly being addicted to playing around the office in mid-development because we knew we had something special and we taunted each other over the conference phones before Ventrillo was invented."
>
> — **Frank Klepacki**, 2017

**IC Application:** Every roadmap phase should produce something playable as early as possible. Phase 2's sim needs to be playable (even with placeholder graphics) early enough for this kind of iterative feedback. The `LocalNetwork` implementation exists precisely for this — quick single-player testing without networking complexity.

### Quality as Culture, Not Process

> "The devotion to quality and excellence was a pillar of Westwood Studios' value and culture and I think that resonated in Dune 2 and is why it became such a successful and genre defining game."
>
> — **Denzil Long**, 2018

> "The success of Westwood was due to the passion, vision, creativity and leadership of Louis Castle and Brett Sperry — all backed up by an incredible team of game makers. It was a Golden Era of game development."
>
> — **Mike Legg**, 2019

Quality at Westwood wasn't an external process imposed on the team — it was an intrinsic cultural value. Multiple developers from different eras and roles describe the same thing: they cared deeply about what they were making. Process followed from culture, not the reverse.

**IC Application:** IC's quality standards (10 invariants, exit criteria per phase, zero-allocation hot paths) are expressions of engineering culture, not bureaucratic checkboxes. When the invariants feel like overhead rather than values, something has gone wrong.

### The Team Is More Important Than the Game

> "Great teams will make great games. As far as advice: learn all you can and spend time writing code. Don't be afraid to fail, experiment, or try things out. Develop the 'soft skills' that will make you a better team member. Be humble. Learn from others. Respect people, build good relationships and above all, be a friend. Your team and the people you choose to be around are more important to your success than any awesome technical skills you can acquire."
>
> — **Denzil Long**, 2018

This is the strongest statement on team culture from any Westwood developer. Technical excellence matters — but it's secondary to team dynamics. The reason Westwood consistently shipped great games wasn't that they had the best programmers. It was that their people worked well together.

**IC Application:** As an open-source project, IC's "team" is its contributors and community. The public design docs, clear invariants, and documented decisions serve the same purpose as Westwood's hallway conversations — they make it possible for people to contribute effectively without requiring everyone to hold the same context in their heads.

### Share Code, Share Knowledge

> "While Joe Bostic was programming on Dune 2, I was programming on Kyrandia 1, and Phil Gorrow was programming on Eye of the Beholder. We shared a lot of code back and forth for all 3 games, forming the Westwood Library of code."
>
> — **Mike Legg**, 2019

Westwood didn't treat each game as an isolated project. They built a shared code library across Dune 2, Kyrandia, and Eye of the Beholder — three completely different genres (RTS, adventure, RPG) running on shared infrastructure. This is remarkably forward-thinking for the early 1990s.

**IC Application:** IC's engine-first architecture (D018, D039) is the direct descendant of this approach. The engine core is game-agnostic. RA1 and TD ship as built-in game modules; RA2 and original games are future community goals on the same engine. The crate structure (`ic-sim`, `ic-render`, `ic-net`, etc.) is the modern equivalent of the Westwood Library.

### Scope Kills — Know When You've Bitten Off Too Much

> "Ultimately, we bit off much with having both the Sailing and Land modes. Instead of having one excellent game mode, we ended up with two less-than-excellent game modes."
>
> — **Mike Legg** on *Pirates: The Legend of Black Kat*, 2019

Mike Legg's candid assessment of Black Kat reveals a lesson Westwood learned the hard way: splitting your effort across too many modes produces mediocrity in all of them. The game started as a focused "Sim Pirate" PC game and grew into a dual-mode console game that couldn't excel at either mode.

**IC Application:** IC's phased roadmap explicitly guards against this. Each phase has specific deliverables — not "everything at once." Phase 2 delivers simulation, not simulation-plus-rendering-plus-networking-plus-modding. The phase exit criteria (08-ROADMAP.md) define what "done" means so that scope doesn't silently expand.

### Organic Design — Let Good Ideas Emerge

> "The item cursor / icon just happened organically as we were prototyping the new engine for it. It just felt so natural and worked so well."
>
> — **Mike Legg** on Kyrandia's single-icon cursor, 2019

Kyrandia's distinctive single-icon cursor — a major departure from the multi-verb SCUMM interface used by LucasArts — wasn't a design document decision. It emerged during prototyping and stuck because it felt right. Good design doesn't always come from planning.

**IC Application:** While IC has thorough architecture documentation, the design docs serve as guardrails, not scripts. Within the invariants, there's room for organic discovery — the same way Westwood discovered the harvester mechanic during Dune 2 development. D033 (toggleable QoL presets) explicitly leaves room for this: experimental features can be toggled on/off rather than permanently committed.

### Work From Love, Not Obligation

> "Working at Westwood was absolutely fantastic! Those days were the 'Wild West' of computer game development. Going to the office was like visiting a magical clubhouse loaded with all kinds of cool technology. We were there all the time, and it was hard to go home. We worked a lot of crazy hours just due to the pure love of what we were doing and what we were working on."
>
> — **Mike Legg**, 2019

Every Westwood developer interviewed — Bostic, Legg, Long, Klepacki — independently describes the same thing: they worked extreme hours because they wanted to, not because they were forced to. This isn't a management technique. It's what happens when passionate people work on something they believe in.

**IC Application:** IC is a passion project built in people's personal time. The design docs exist because the work is interesting, not because someone assigned it. If the project ever starts feeling like obligation rather than passion, revisit Bostic's warning about what killed Westwood: "This shift from passion to profit took its toll."

### Immediate Feedback — The One-Second Rule

Louis Castle emphasized in GDC talks and the Ars Technica "War Stories" interview (2019) that players should receive feedback for every action within one second. This encompasses the full response chain: click a unit → voice line + selection visual; issue a move order → unit turns and begins moving; start a build → audio cue + sidebar animation.

The principle goes beyond input latency. It's about *perceived acknowledgment*. A command that appears to be ignored — even if the sim is processing it — breaks the "bedroom commander" fantasy. The player is issuing orders through a live military feed; the feed must respond.

Castle tied this directly to the context-sensitive cursor design. The cursor itself is feedback: hovering over an enemy shows an attack cursor, hovering over terrain shows a move cursor. The player sees the game's understanding of their intent *before* they click. This pre-click feedback reduces errors and makes the interface feel intelligent.

**IC Application:** The `InputSource` trait (Invariant #10) and `ic-ui` cursor system must implement immediate visual and audio feedback for all player actions. During Phase 3 (Game Chrome), feedback responsiveness should be a review criterion as important as functional correctness. Unit voice acknowledgment, cursor changes, and build queue feedback are not polish — they're core UX.

### Visual Clarity and Readability

Castle described a concrete design test: you should be able to look at a screenshot for one second and know who is winning, what units are on screen, and where the resources are. This "one-second screenshot" test was a check applied throughout Westwood's design process.

The principle drove specific decisions: strong faction color coding, distinctive unit silhouettes at combat zoom levels, clear resource field visuals, and health bar readability. Aesthetic appeal was secondary to gameplay readability. A beautiful screenshot that requires study to parse has failed the test.

**IC Application:** This is a render-side principle with sim-side implications. The `Renderable` trait implementations in `ic-render` must prioritize readability across all quality tiers — even the lowest LOD/GPU fallback path must produce readable gameplay. Modding guidelines should include silhouette and color-contrast requirements for custom unit sprites. D032 (UI themes) must preserve readability regardless of aesthetic choices.

### The Context-Sensitive Cursor and Sidebar Philosophy

Two specific Westwood innovations embody the "reduce cognitive load" principle:

1. **The context-sensitive cursor** changed the RTS interface from "select verb, then select target" (the strategy game tradition) to "the cursor *is* the verb." This was one of the most influential UX innovations in the genre, copied by nearly every RTS that followed. It emerged organically (see Mike Legg on Kyrandia's single-icon cursor) and was refined into C&C's military context.

2. **The sidebar build menu** was a conscious choice to keep the build interface visible at all times. Unlike the bottom-bar approach (StarCraft, Age of Empires), the sidebar lets players queue production without scrolling the camera to their base. This preserves battlefield awareness during production decisions.

Both follow the same principle: never make the player think about *how* to interact when they should be thinking about *what* to do.

**IC Application:** D032 (switchable UI themes) supports sidebar, bottom-bar, and potentially other layouts — but all layouts should follow the "build without losing the battlefield" principle. The `InputSource` trait abstraction (Invariant #10) should make cursor behavior consistent across input methods (mouse, touch, gamepad) while preserving context-sensitivity.

### Asymmetric Faction Identity

Westwood's faction design philosophy was explicit: GDI and Nod were not stat variations — they were *philosophically different armies*. GDI represented might and armor (slow, expensive, powerful). Nod represented stealth and speed (cheap, fragile, hit-and-run). In Red Alert: Allies favor technology and precision; Soviets favor brute force and numbers.

The design test: if you can swap faction skins and the gameplay feels identical, the faction design has failed. Playing Nod should feel like playing a fundamentally different game than playing GDI. This extends beyond unit stats to production structures, tech trees, super weapons, and strategic tempo.

Balance doesn't mean equal stats. It means providing every "overpowered" tool with a specific, skill-based counter. Tesla Coils are devastating on defense — but they're expensive, power-hungry, and immobile. The counter is disruption (destroy power, outmaneuver), not a symmetrically powerful Allied tower.

**IC Application:** D019 (balance presets) and the versus table system (D028) must support asymmetric design natively. Modders should be able to define radically different faction identities in YAML without code changes. The competitive infrastructure should accommodate asymmetric balance (faction-specific leaderboards, faction pick/ban).

### The Core Four-Step Loop

The most enduring C&C design pattern is the core loop:

1. **Extract** — Gather resources (ore, Tiberium, supplies)
2. **Build** — Construct base structures and expand territory
3. **Amass** — Produce and organize a military force
4. **Crush** — Engage and destroy the enemy

Every system in a C&C game should feed into one of these steps. The Westwood-era games that deviated from this loop (Renegade, the cancelled FPS projects) struggled with identity. The EA-era "kitchen sink" approach — adding hero units, global powers, and other systems that bypass the loop — produced unfocused games. The most celebrated C&C titles (RA1, Tiberian Sun, Generals) kept the loop tight.

This is the game-design-specific version of "Scope to What You Have": feature creep that doesn't serve the core loop produces the same result as scope creep in engineering.

**IC Application:** When evaluating game design features (not engine features), the first filter after "does it make the toy soldiers come alive?" is "which loop step does it serve?" Features that introduce a fifth parallel loop (economy management mini-games, hero progression, card systems) need very strong justification.

### Game Feel — "The Juice"

Westwood understood from the beginning that visceral feedback separates a good RTS from a great one. The SAGE engine era (Generals, C&C3) formalized this as "physics as fun" — buildings crumble with physical debris, weapons create visual and audio impact proportional to their power, destroyed units leave husks and wreckage that persist on the battlefield as evidence of combat.

The checklist for "juice":
- **Impact:** Do explosions feel proportional to the weapon? Does a tank shell hit differently from a rifle round?
- **Persistence:** Do destroyed units leave husks? Does the battlefield show evidence of combat over time?
- **Physicality:** Does debris scatter? Do buildings collapse structurally rather than popping out of existence?
- **Weight:** Do heavy units *feel* heavy? Do light units feel fast and nimble?
- **Screen communication:** Does the camera communicate force? (Subtle shake on heavy impacts, flash on detonations)

**IC Application:** All "juice" lives in `ic-render` and `ic-audio`, never in `ic-sim`. The sim tracks what happened (unit destroyed, building collapsed, debris spawned). The render and audio systems make it *feel good*. Game-feel parameters (explosion intensity, shake magnitude, debris count) should be YAML-configurable so modders can tune the feel without code changes.

### Audio as Gameplay Driver

Klepacki's philosophy extended beyond "write good music" to a gameplay-coupling insight: music should match the tempo of the game and drive the player's actions-per-minute. "Hell March" isn't just a good track — it's a gameplay accelerator. Players mechanically play faster when high-energy music is driving them. Ambient, tense music during build-up phases lets the player think.

This extends to unit responses: each unit's voice should reflect its personality and role. A Commando's bravado communicates "use me aggressively." A Rifle Infantry's professional acknowledgment communicates "I'm expendable but reliable." Audio is characterization and tactical information, not decoration.

**IC Application:** `ic-audio` should support dynamic music states (combat/build-up/tension/victory) that transition based on game state. Unit voice design is a modding concern (YAML-defined per unit type), but the engine must support the infrastructure: voice priority queuing, distance-based culling that never culls critical acknowledgment sounds, and multiple voice line pools per unit type for variety.

### The Damage Matrix — Counter-Play by Design

Westwood established the warhead/armor versus table in the original Red Alert: each weapon has a warhead type, each unit has an armor class, and a versus table defines the damage multiplier at each intersection. This mathematical structure makes "no monoculture" a design invariant rather than a playtesting hope.

EA expanded this during the Generals/C&C3 era with more granular damage categories (Crush, Sniper, Cannon, Rocket, Flame, etc.) and additional armor classes, creating a richer counter-play web. The principle remained the same: the versus table is the fundamental balance tool.

The design principle isn't "add more damage types." It's: the versus table should make the optimal army composition *depend on what the opponent is building*. If playtesting reveals a monoculture (one unit type or composition dominates regardless of opposition), the versus table is the first diagnostic tool. Single-unit dominance is always a versus-table bug.

**IC Application:** D028 (damage pipeline, Phase 2 hard requirement) must expose the versus table as human-readable YAML data, not buried in code. Balance presets (D019) may define different versus tables. The mod SDK should include visualization tools for the counter-play graph. OpenRA's `Versus` keyword in `Warhead` definitions directly informs our schema (D023/D027 compatibility).

---

## Part 3: Their Engineering Methods (What They Built)

These are development practices observed through their code, architecture decisions, and production history. Where quotes exist, they come from developers describing specific technical approaches.

### Data-Driven Design (INI Files)

The original C&C games stored all game data — unit stats, weapon properties, building costs, AI parameters — in INI files, not compiled code. This wasn't accidental. It was a deliberate architectural choice that:

- Let designers iterate without recompiling
- Made the game inherently moddable (the community discovered this and ran with it)
- Separated "what the game does" from "what values it uses"
- Survived across multiple C&C titles with minimal format changes

**Evidence:** The EA source code shows all gameplay values loaded from INI at runtime. OpenRA inherited this as MiniYAML. The Remastered Collection preserved it.

**IC Application:** D003 (real YAML), D023 (OpenRA vocabulary compatibility), D025 (runtime MiniYAML). All gameplay data lives in YAML. The simulation loads values at startup, not at compile time. Modders change YAML, not Rust code. This is the direct continuation of Westwood's original INI philosophy.

### Integer Math for Determinism

The original C&C engine uses integer arithmetic exclusively for game logic. No floating-point math in the simulation. This wasn't because floats were slow on 1995 hardware (they were available) — it was because deterministic multiplayer requires bitwise-identical results across all clients.

**Evidence:** The GPL source code confirms integer math throughout. Coordinates, damage calculations, movement — all integer. The Remastered Collection preserved this, running the original integer sim as a DLL called from the C# client.

**IC Application:** D009 (fixed-point math, no floats in sim). This is the same decision for the same reason, 30 years later. Our `i32`/`i64` fixed-point math in `ic-sim` directly follows what Westwood proved works.

### OutList / DoList Order Pattern

The original engine uses a two-buffer approach for player orders:
- **OutList**: Orders the local player has issued this frame (outgoing)
- **DoList**: Orders all clients have agreed to execute this tick (incoming after network sync)

This cleanly separates "what the player wants" from "what the simulation does." Network code touches OutList and DoList. Simulation code only reads DoList.

**Evidence:** Clearly visible in the EA source code. The Generals/Zero Hour codebase evolved this into a more sophisticated version with adaptive run-ahead and frame readiness states.

**IC Application:** Our `PlayerOrder → TickOrders → apply_tick()` pipeline is the same pattern with different names. `ic-protocol` defines the order types, `ic-net` handles the OutList ↔ DoList exchange, `ic-sim` only sees the equivalent of DoList. The crate boundary (`ic-sim` never imports `ic-net`) enforces what Westwood achieved through discipline.

### Layered Architecture That Survives Decades

The Remastered Collection's architecture reveals something remarkable: the original game engine (C++) runs as a headless DLL, called synchronously by the new C# client layer. The original rendering was software-to-RAM, intercepted via `DLL_Draw_Intercept` for GPU rendering by the C# layer. The original networking was replaced entirely.

The simulation layer — the core game logic — survived 25 years and a complete platform change because it was clean enough to extract as a library.

**IC Application:** This is the ultimate proof-of-concept for IC's sim/render/net separation. If Westwood's 1995 C++ code could survive as a library called from C# in 2020, our Bevy ECS sim should survive whatever rendering and networking technology comes next.

### Layered Pathfinding Heuristics (Avoiding "Artificial Idiocy")

Louis Castle described the specific heuristics used to make high-unit-count movement possible on 1990s hardware without stalling the CPU. The goal was "looking smart" over "being perfect." Castle called the opposite — units vibrating or taking bizarre routes to achieve mathematical optimality — "Artificial Idiocy."

> "You just want to avoid artificial idiocy. If you spend more time just making sure it doesn't do something stupid, it'll actually look pretty smart."
>
> — **Louis Castle**, 2019

The heuristic layers were:
1. **Ignore Moving Friendlies:** When calculating a path, assume any moving friendly unit will be gone by the time you get there. Do not path around them.
2. **Wiggle Static Friendlies:** If blocked by a stationary friendly, try to "wiggle" the blocker to open a hole.
3. **Repath:** Only if the first two fail, calculate a new long-distance path.

**IC Application:** This validates IC's tiered pathfinding approach (D013). Don't recompute paths for every dynamic obstacle. Assume flow. Perfection is expensive; "not looking stupid" is the goal.

### Community-First Development (Remastered Era)

Jim Vessella's approach to the C&C Remastered Collection introduced methods that Westwood never had access to:

- **Community Council**: 15+ community leaders and content creators brought into the development process early. Not just feedback — active participation in design decisions.
- **Public Development Updates**: 20+ blog posts documenting progress, decisions, and rationale throughout 2018–2020.
- **Community Votes on Key Decisions**: Art style direction, sidebar layout, and other UX decisions were put to community vote.
- **Open Source Release**: The game engine source code was released under GPL v3, making it available for study and modification. This was unprecedented for EA.

**IC Application:** IC is open from day one — not as a corporate gesture, but as the fundamental development model. The design documents are public. The research is public. Community feedback shapes the project during the design phase, not after release. D020 (Mod SDK), D030 (workshop resource registry), and the entire modding tier system (D003/D004/D005) are the logical extensions of Vessella's community-first philosophy.

---

## Part 4: Their Warnings (What Went Wrong)

### The "Every Game Must Be a Hit" Trap

Bostic identified the root cause of Westwood's decline: EA's corporate pressure transformed the studio from a passion-driven culture into a hit-driven culture. Bigger budgets, bigger teams, narrower individual roles, less creative risk.

**IC Lesson:** Scope the project to what a small passionate team can build. The performance pyramid (10-PERFORMANCE.md) deliberately puts algorithmic efficiency before parallelism — because algorithms don't require bigger teams, more cores do. The 36-month roadmap is ambitious but structured so that each phase produces a usable artifact, not just progress toward a distant goal.

### The License Dependency

Westwood's dependence on the Dune license almost constrained the RTS genre into a single IP. It was the *loss* of that license that forced C&C's creation.

**IC Lesson:** IC is engine-first, not game-first. D018 (multi-game extensibility) and D039 (engine scope) mean RA1 and TD ship as built-in game modules, with the engine open to any classic RTS. The engine doesn't depend on any single IP. If RA1 were somehow made impossible, the engine would still work for TD, RA2, or entirely original games. No single dependency should be existential.

### The Recompilation Barrier

OpenRA proved that C#/.NET creates a recompilation barrier for modders. Westwood's original INI-driven approach was more mod-friendly than OpenRA's trait system, because modders didn't need to compile anything.

**IC Lesson:** D003/D004/D005 (YAML → Lua → WASM modding tiers) explicitly address this. 80% of mods should be achievable with YAML alone — no compilation. Lua covers the next 15%. Only total conversions need WASM (which is still easier than C#). The bar for modding should be *lower* than the original game's, not higher.

---

## Part 5: The OpenRA Inheritance

OpenRA has been the steward of C&C in the open-source world since 2007 — 18+ years of active development. Their design philosophy, development practices, and hard-won lessons are as relevant to IC as Westwood's originals. We study them not to copy their approach, but to learn from both their successes and the tensions they've navigated.

### Two Mission Goals

From the OpenRA Development Goals wiki (last edited December 2019):

> "The OpenRA project has two main goals:
> 1. Recreating the original 2D Command & Conquer games with enhancements inspired by more modern RTS games. OpenRA should retain the feel and nostalgia of the older games, but remove the frustrating and dated elements.
> 2. Create a flexible 2D RTS game engine that others can use to build their own games. The 2D C&C games were well known for being highly moddable, but this flexibility was lost in the transition to the more complicated 3D game engines."

**IC Application:** IC shares both goals, with different trade-offs. We also recreate the classics with modern enhancements (goal 1) and build a general-purpose engine (goal 2). The key difference: IC's engine is designed for 2D *and* 2.5D/3D from the start (WorldPos has x, y, z — Invariant #9), and our modding approach deliberately avoids requiring recompilation (D003/D004/D005 vs OpenRA's C# traits).

### "Not a Clone" — Intentional Modernization

From the OpenRA FAQ:

> "You are right. This is, in fact, intended. OpenRA is not a clone. We have introduced many features found in modern RTS games."

OpenRA openly states that gameplay differences from the originals are *intentional*, not bugs. Attack move, fog of war, build queues, modern controls — these are deliberate design choices to modernize the experience.

**IC Application:** IC takes the same stance but resolves the tension differently. Rather than choosing either "authentic" or "modern," D019 (switchable balance presets) and D033 (toggleable QoL presets) let players choose their experience. Classic RA, OpenRA balance, and Remastered balance are all available. The engine doesn't pick sides.

### OpenRA vs. Remastered — Two Valid Philosophies

Paul Chote articulated the sharpest definition of OpenRA's philosophy in the June 2020 devblog, when the Remastered Collection launched:

> "OpenRA and the Remastered Collection follow different philosophies about how to bring the classic C&C games into the 2020s. The Remastered Collection, as its name implies, upgrades the original game titles with higher fidelity assets and UI improvements while prioritising authenticity to the original gameplay experience. OpenRA's goal is to envision what these games may instead have been were they developed again now — with features such as Attack Move, multiplayer-focused balance, and extensive modding capabilities designed into the core of the experience."
>
> "We believe that both approaches can coexist, and intend for OpenRA to continue following the same philosophies that have guided it so far."

**IC Application:** IC explicitly embraces both philosophies. Bostic's "Remaster, Don't Remake" (Part 1, Principle 10) and OpenRA's "reimagine for today" are not contradictions — they're different points on a spectrum. D019 puts the player in control of where on that spectrum they play.

### The "Original vs. Modern" Tension

The June 2018 devblog reveals the most candid internal design tension in OpenRA's history:

> "OpenRA's Red Alert mod is well known in the C&C community for including a collection of arbitrary gameplay changes that were not in the original game or series. Many of these changes were introduced in the early days of OpenRA to help balance the game and make it play well despite missing core gameplay features... Over time, these changes became entrenched, for better or worse, as part of OpenRA's identity."
>
> "This dichotomy between 'Original Red Alert' and 'Original OpenRA' has caused significant conflict among our players and contributors on the forum and the community Discord channels."

This is a cautionary tale about design debt. Early compromises made to ship a playable game (before features like 5-infantry-per-cell or proper engineers existed) hardened into permanent gameplay identity. When the team later wanted to reconsider, the community was split.

**IC Lesson:** Make temporary compromises explicit and reversible. D033's toggle system is designed to prevent exactly this: every QoL or gameplay variant can be individually enabled/disabled, so early-phase compromises never become irrevocable identity. Label experiments as experiments.

### Composition Over Inheritance — The Trait System

From the Hacking wiki (architecture documentation, authored by Chris Forbes):

> "All units/structures/most things in the map are Actors. Actors contain a collection of traits. Traits consist of an info class and a class that does stuff. There is one instance of the infoclass shared across all actors of the same type. Each actor gets its own instance of the trait class itself."
>
> "We've tried to make individual traits implement as self-contained a unit of functionality as possible — all cross-trait references should be in terms of an interface from TraitsInterfaces.cs."

OpenRA's trait system is composition-over-inheritance at the game architecture level. Units are assembled from traits in YAML, not defined in rigid class hierarchies. This is why OpenRA is so moddable — and it's a direct evolution of Westwood's INI-driven data approach.

**IC Application:** IC's ECS (Bevy) is the natural Rust equivalent. ECS components are conceptually identical to OpenRA traits: composable units of functionality attached to entities via data. D023 (OpenRA vocabulary compatibility) maps OpenRA trait names to IC component names — `Armament` in OpenRA YAML routes to the equivalent IC combat component. The architecture is compatible at the conceptual level, even though the implementation (C# traits vs Rust ECS) is completely different.

### Clean-Room Implementation

From the OpenRA FAQ:

> "OpenRA is a clean-room implementation of the original Westwood engine based on reverse engineering the game-files without any disassembling, DLL injections or binary patches of the original executables."

OpenRA was built without access to source code. They reverse-engineered file formats and gameplay behavior from the outside. This is both a legal necessity and an engineering achievement.

**IC Application:** IC has an advantage OpenRA never had: the EA GPL source releases (2020–2025). We can read the actual implementation, verify our understanding of gameplay mechanics against the original code, and extract canonical values (damage tables, weapon ranges, unit speeds) directly. This doesn't make OpenRA's reverse engineering less impressive — but it means IC should produce more accurate classic-mode gameplay.

### Volunteer Development — Strengths and Limits

From the Development Goals wiki:

> "OpenRA is developed by volunteers in their spare time, and so we do not follow a traditional development process with strictly planned milestones and assigned features... Instead, specific features are worked on by individual contributors as their time and interest allows; this can lead to what appears to be piecemeal and sporadic development to an outside observer."

OpenRA is honest about the trade-offs of volunteer development. Features ship when someone cares enough to build them. This has kept the project alive for 18 years — but it also means some long-desired features (Tiberian Sun support, save games) have never shipped.

**IC Lesson:** IC faces the same constraint. The 36-month roadmap is aspirational, not contractual. The phased structure helps by breaking work into independent chunks that individual contributors can tackle. But the roadmap should never become a source of pressure that turns passion into obligation (see Part 2: "Work From Love, Not Obligation").

### Community Governance

OpenRA's governance model:

- **Minimum 2 reviewer approvals** before any PR merge
- **Three persistent branches**: `bleed` (development), `prep-YYMM` (stabilization), `master` (release)
- **Playtest → Release pipeline** with public testing phases
- **Contributor Covenant v1.4** code of conduct
- **"The core development team has a number of long-term goals, which have been planned over a combination of GitHub issues, IRC discussion, and forum posts"** — decisions emerge from discussion, not top-down mandate

**IC Application:** IC should adopt a similar review culture once there are multiple contributors. The 2-reviewer minimum is good practice. The three-branch model maps well to IC's phased approach. The key OpenRA lesson: keep governance lightweight and discussion-based. Formal processes that outweigh the contribution they protect will drive away volunteers.

### Relationship with EA — A Model for IC

OpenRA's relationship with EA evolved from cautious coexistence to active collaboration:

- **October 2018:** EA's Jim Vessella chose openra.net to co-announce the C&C Remastered Collection exploration
- **OpenRA team members sat on EA's C&C Community Council** — active participation in Remastered design decisions
- **GPLv3 source release** of Remastered gameplay DLLs was partly inspired by OpenRA
- **Paul Chote's assessment:** "Comments from EA suggest that they are also ok with the current situation, and have no plans to interfere with OpenRA in any negative way."

**IC Application:** IC should maintain the same respectful relationship. We use EA's GPL source code under its intended license. We study OpenRA's open-source codebase under GPL. We don't compete with EA's commercial products — we build something new that serves the community. D011 (community layer, not sim layer) and the cross-engine compatibility strategy (07-CROSS-ENGINE.md) are designed in this spirit.

### Per-Mod Design Approaches

OpenRA applies different philosophies to different games:

- **Red Alert / Tiberian Dawn:** "Feature-complete for multiplayer gaming. Focus is now: implementing singleplayer campaigns, adjusting multiplayer balance based on player feedback, improving polish and moving closer to the original game's feel, without regressing the intentional changes/improvements."
- **Dune 2000:** "Our eventual goal is for our D2K mod to be a faithful thematic recreation of the original game." — Positioned closer to the "authentic" end.
- **Tiberian Sun:** The perennial "next major step" blocked by manpower.

This shows that even within a single project, one-size-fits-all philosophy is wrong. Different games need different approaches.

**IC Application:** IC's game module system (D018) supports per-module philosophy natively. RA1 can be "modernized classic" while a future TD module could be "faithful recreation." The engine doesn't impose a philosophy — each `GameModule` defines its own system pipeline, balance approach, and aesthetic targets.

### Manpower as the Binding Constraint

A recurring theme across OpenRA blog posts spanning years:

> "Resolving these issues takes a significant amount of work, and we currently only have one person (with very limited time) with the knowledge required to tackle them." — 2018
>
> "While OpenRA's releases have slowed down due to lack of manpower, our third party scene is going strong!" — 2023

Despite 339 contributors, 16.4k GitHub stars, and 18 years of history, OpenRA's core team is tiny. Most major features depend on a handful of people. Release frequency has declined. Knowledge concentration is a real risk.

**IC Lesson:** Design systems so that knowledge isn't concentrated in one person. IC's design docs, AGENTS.md, and documented decision rationale (09-DECISIONS.md) serve this purpose — any contributor should be able to understand *why* a system exists, not just *what* it does. The Westwood lesson applies here too: when key people leave (as they always eventually do), the documentation and architectural clarity are what survive.

### What OpenRA Got Right

1. **Trait system moddability** — YAML-configurable game behavior without recompilation (for most changes)
2. **Cross-platform from day one** — Windows, macOS, Linux, *BSD
3. **18 years of sustained development** — institutional longevity as a volunteer project
4. **Community-driven balance** — competitive league (RAGL, 15+ seasons) directly influencing design
5. **Third-party mod ecosystem** — Combined Arms, Romanov's Vengeance, OpenHV, Shattered Paradise
6. **Clean-room legal foundation** — no legal encumbrances
7. **EA relationship** — from cautious distance to active collaboration

### What OpenRA Struggled With

1. **C# barrier for modders** — total conversions require C# (higher bar than Westwood's data-driven INI)
2. **TCP-based lockstep networking** — reliable but higher latency; desync debugging (135+ tracker issues) is a persistent pain point
3. **MiniYAML** — custom format requires custom tooling; no standard editor support
4. **Tiberian Sun** — blocked for years by renderer complexity and manpower constraints
5. **Early design debt** — balance compromises became entrenched identity (see "Original vs. Modern" above)
6. **Single-threaded sim** — performance ceiling for large battles
7. **Save game system** — replay-based saves have acknowledged limitations
8. **Manpower concentration** — critical features depend on 1–2 individuals

---

## Part 6: Methodology for Iron Curtain

Based on the principles above, these are the development methods IC should follow:

### Design Methods

1. **Fix the invariants early, iterate everything else.** Westwood knew "real-time" was non-negotiable from day one. They discovered harvesting along the way. IC's 10 invariants (AGENTS.md) are the "real-time" — everything else can evolve.

2. **Fun beats documentation.** If a system plays well but contradicts the design doc, update the doc. If a system is in the doc but plays poorly, cut it. The doc serves the game.

3. **One person should hold both the technical and design vision** for each major system. Bostic was both lead programmer and gameplay designer. Don't split these roles at this scale.

4. **Ask "does this make the toy soldiers come alive?"** before adding any feature. If the answer is no, the feature needs a very strong justification.

5. **Constraints are features.** Don't fight the constraints (no floats, ECS only, deterministic). Use them as creative forcing functions.

### Engineering Methods

6. **Separate simulation from I/O.** The sim is the part that survives decades. Make it pure. This is the single most validated principle in C&C's history.

7. **Data-driven everything.** Game values belong in YAML, not Rust code. If a modder would want to change it, it shouldn't require recompilation.

8. **Integer math in the sim.** This is settled engineering, proven over 30 years and multiple engines. Don't revisit it.

9. **Write comments that explain *why*.** Bostic could read his 25-year-old comments and remember the thought process. Write for your future self.

10. **Design for extraction.** The Remastered team extracted the original sim as a DLL. Design every system so it could be extracted, replaced, or wrapped — not just refactored.

11. **Avoid Artificial Idiocy.** Use heuristics to make units predictable rather than perfect. Ignore moving friendlies; wiggle static ones; only repath as a last resort.

### Production Methods

12. **Ship usable artifacts per phase.** Each roadmap phase should produce something runnable, not just "progress." Phase 0 produces a format parser. Phase 1 produces a visual renderer. Phase 2 produces a playable sim.

13. **Scope to the team you have, not the team you wish for.** Westwood's magic was small teams. Don't plan for 50 contributors when you have 5.

14. **Learn what you need.** Westwood taught themselves filmmaking. Don't wait for the "right" expertise — study prior art and build.

15. **Protect the passion.** When a decision between "fun/interesting" and "safe/corporate" arises, choose the former. Bostic's retrospective is clear: passion made the great games, corporate pressure killed the studio.

16. **Engage the community during design, not after release.** Vessella's Community Council model works. IC's public design docs are a version of this — the community can see and influence design decisions before a single line of code is written.

---

## Appendix: Public Resources

### Interviews

- [Joe Bostic — Westwood Studios Interview (2018)](https://www.arcadeattack.co.uk/joe-bostic/)
- [Joe Bostic — C&C Remastered Interview (2020)](https://www.arcadeattack.co.uk/joe-bostic-cc-remastered/)
- [Frank Klepacki — Westwood Studios Interview (2017)](https://www.arcadeattack.co.uk/frank-klepacki/)
- [Mike Legg — EA/Westwood Studios Interview (2019)](https://www.arcadeattack.co.uk/mike-legg/)
- [Denzil Long — Command and Conquer Interview (2018)](https://www.arcadeattack.co.uk/denzil-long/)
- [Louis Castle — Ars Technica: "War Stories" (2019)](https://www.youtube.com/watch?v=S-VAL7Epn3o)

### GDC Talks (GDC Vault)

- Louis Castle — "1996 Developer Spotlight" (GDC 1997)
- Louis Castle — "Apparent Intelligence or Inanimate Objects Make Good Friends" (GDC 1997)
- Louis Castle — "Blade Runner: Soup to Nuts!" (GDC 1998)

### Source Code

- [EA Red Alert Source (GPL v3)](https://github.com/electronicarts/CnC_Red_Alert)
- [EA Tiberian Dawn Source (GPL v3)](https://github.com/electronicarts/CnC_Tiberian_Dawn)
- [EA Generals / Zero Hour Source (GPL v3)](https://github.com/electronicarts/CnC_Generals_Zero_Hour)
- [EA Remastered Collection Source (GPL v3)](https://github.com/electronicarts/CnC_Remastered_Collection)

### OpenRA Project

- [OpenRA GitHub Repository](https://github.com/OpenRA/OpenRA)
- [OpenRA About Page](https://www.openra.net/about/)
- [OpenRA Development Goals Wiki](https://github.com/OpenRA/OpenRA/wiki/Development-Goals)
- [OpenRA FAQ Wiki](https://github.com/OpenRA/OpenRA/wiki/FAQ)
- [OpenRA Hacking Wiki (Architecture)](https://github.com/OpenRA/OpenRA/wiki/Hacking)
- [OpenRA Coding Standard Wiki](https://github.com/OpenRA/OpenRA/wiki/Coding-Standard)
- [OpenRA Contributing Guide](https://github.com/OpenRA/OpenRA/wiki/Contributing)
- [Paul Chote — Balance Philosophy Devblog (June 2018)](https://www.openra.net/news/devblog-20180610/)
- [Paul Chote — OpenRA vs Remastered Devblog (June 2020)](https://www.openra.net/news/devblog-20200629/)
- [EA Announcement on OpenRA (October 2018)](https://www.openra.net/news/special-announcement/)
- [OpenRA Mod SDK](https://github.com/OpenRA/OpenRAModSDK)

### Community

- [Jim Vessella's Reddit development updates](https://www.reddit.com/user/EA_Jimtern/) (user EA_Jimtern)
- [C&C Remastered Steam Community](https://steamcommunity.com/app/1213210)
- [Red Alert Global League (RAGL)](https://forum.openra.net/viewforum.php?f=85) — 15+ seasons of competitive play

### Further Reading

- *Computer Gaming World*, August 1993 — "Westwood Studios Partnership Hits Jackpot"
- [Wikipedia — Westwood Studios](https://en.wikipedia.org/wiki/Westwood_Studios)
