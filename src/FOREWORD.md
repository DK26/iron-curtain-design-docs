# Foreword — Why I'm Building This

I've been a Red Alert fan since the first game came out. I was a kid, playing at a friend's house over what we'd now call a "LAN" — two ancient computers connected with a cable. I was hooked. The cutscenes, the music, building a base and watching your stuff fight. I would literally go to any friend's house that could run this game just to play it.

That game is the reason I wanted to learn how computers work. Someone, somewhere, *built* that. I wanted to know how.

## Growing Up

I started programming at 12 — Pascal. Wrote little programs, thought it was amazing, and then looked at what it would actually take to make a game that looks and feels and plays real good. Yeah, that was going to take a while.

I went through a lot of jobs and technologies over the years. Network engineering, backend development, automations, cyber defense. I wrote Java for a while, then Python for many years. Each job taught me things I didn't know I'd need later. I wasn't chasing a goal — I was just building a career and getting better at making software.

Along the way I discovered Rust. It clicked. Most programming languages make you choose: either you get full control over your computer's resources (but risk hard-to-find bugs and crashes), or you get safety (but give up performance). Rust gives you both. The language is designed so that entire categories of bugs — the kind that cause crashes, security holes, and impossible-to-reproduce errors — simply can't happen. The compiler catches them before the program ever runs. You can write high-performance code and actually sleep at night.

I also found OpenRA around this time, and I was glad an open-source community had kept Red Alert alive for so long. I browsed through the C# codebase (I know C# well enough), enjoyed poking around the internals, but eventually real life pulled me away.

I did buy a Rust game dev book though. Took some Udemy courses. Played with prototypes. The idea of writing a game in Rust never quite left.

## The Other Games That Mattered

I was a gamer my whole life, and a few games shaped how I think about making games, not just playing them.

**Half-Life** — I spent hours customizing levels and poking at its mechanics. Same for **Deus Ex** — pulling apart systems, seeing how things connected.

But the one that really got me was **Operation Flashpoint: Cold War Crisis** (now ArmA: Cold War Assault). OFP had a mission editor that was actually approachable. You could create scenarios in simple ways, dig through its resources and files, and build something that felt real. I spent more time editing missions, campaigns, and multiplayer scenarios for OFP than playing any other game. Recreating movie scenes, building tactical situations, making co-op missions for friends — that was my thing.

What OFP taught me is that the best games are the ones that give you tools and get out of your way. Games as platforms, not just products. That idea stuck with me for twenty years, and it's a big part of why Iron Curtain works the way it does.

## How This Actually Started

Over five years, Rust became my main language. I built backend systems, contributed to open-source projects, and got to the point where I could think in Rust the way I used to think in Python. The idea kept nagging: what if I tried writing a Red Alert engine in Rust?

Then, separately, I got into LLMs and AI agents. I was between jobs and decided to learn the tooling by building real projects with it. Honestly, I hated it at first. The LLM would generate a bunch of code, and I'd spend all my time reviewing and correcting it. It got credit for the fun part.

But the tools got better, and so did I. What changed is that they made it realistic to take on big, complex solo projects with proper architecture. Break everything down, make each piece testable, follow best practices throughout. The tooling caught up with what I already knew how to do.

This project didn't start as an attempt to replace OpenRA. I just wanted to test new technology — see if Rust, Bevy, and LLM-assisted development could come together into something real. A proof of concept. A learning exercise. But the more I thought about the design, the more I realized it could actually serve the community. That's when I decided to take it seriously.

This project is also a research opportunity for me. I want to learn how to do LLM-assisted coding *correctly* — not just throw prompts at a model and ship whatever comes back. I'm a developer who needs to understand what code does. When code is generated, I do my best to read through it, understand every part, and verify it. I use the best models available to cross-check, document, and maintain a consistent code style so the codebase stays reviewable by humans.

There's a compounding effect here: as the framework and architecture become more solid, the rules for how the LLM creates and modifies code become more focused and restricted. The design docs, the invariants, the crate boundaries — they all constrain what the LLM can do, which reduces the chance of serious errors. On top of that, I'm a firm believer in verifying code with tests and benchmarks. If it's not tested, it doesn't count.

## What Bugged Me About the Alternatives

OpenRA is great for what it is. But it's written in C#, a language that prioritizes developer convenience over raw performance. The original Red Alert was written in C, which runs much closer to the hardware. C# has a built-in system called a garbage collector that periodically pauses the game to clean up unused memory — in a fast-paced RTS, those pauses cause stutters. In practice, big battles lag, desyncs (where players' games get out of sync) happen a lot and are nearly impossible to debug, and if you want to mod anything deep, you need to learn C# and work against a large, complex codebase.

The Remastered Collection looks beautiful but barely changed the engine. The servers are rough. Modding is limited. Windows and Xbox only.

I kept thinking about what Rust brings to the table:

- Fast like C — runs close to the hardware, no garbage collector, predictable performance
- Safe — the compiler prevents the kinds of bugs that cause crashes and security vulnerabilities in other languages
- Built for multi-core — modern CPUs have many cores, and Rust makes it safe to use all of them without the concurrency bugs that plague other languages
- Here to stay — it's in the Linux kernel, backed by every major tech company, and growing fast

## What I Wanted to Build

Once I committed, the ideas came fast.

**Bevy** was the obvious engine choice. It's the most popular community-driven Rust game engine, it uses a modern architecture that's a natural fit for RTS games (where you need to efficiently manage thousands of units at once), and there's a whole community of people working on it constantly. Building on top of Bevy means inheriting their progress instead of reinventing rendering, audio, and asset pipelines from scratch. And it means modders get access to a real modern rendering stack — imagine toggling between classic sprites and something with dynamic water, weather effects, proper lighting. Or just keeping it classic, but smooth.

**Cross-engine compatibility** — I wanted OpenRA players and Iron Curtain players to coexist. My background includes a lot of work translating between different systems, and the same principles apply here.

**Switchable netcode** — inspired by how CS2 does sub-tick processing and relay servers. If we pick the wrong networking model, or something better comes along, we should be able to swap it without touching the simulation code.

**Community independence** — the game should never die because someone turns off a server. Self-hosted everything. Federated workshop. No single point of failure.

**Security done through architecture** — not a kernel-level anti-cheat, but real defenses: order validation inside the simulation, signed replays, relay servers that own the clock. Stuff that comes from building backend systems and knowing how people cheat.

**LLM-generated missions** — this is the part that excites me most. What if you could describe a scenario in plain English and get a playable mission? Like OFP's mission editor, but you just tell it what you want. The output is standard YAML and Lua, fully editable. Infinite content.

## Where This Is Now

I put all of these ideas together and did a serious research phase to figure out what's actually feasible. These design documents are the result. They cover architecture, networking, modding, security, performance, file format compatibility, cross-engine play, and a 36-month roadmap.

Every decision has a rationale. Every system has been thought through against the others. It's designed to be built piece by piece, tested in isolation, and contributed to by anyone who cares to.

What started as "can I get this to work?" turned into "how do I make sure everything I build can serve the community?" That's where I am now.

---

*— David Krasnitsky, February 2026*
