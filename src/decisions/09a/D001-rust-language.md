## D001: Language — Rust

**Decision:** Build the engine in Rust.

**Rationale:**
- No GC pauses (C# / .NET is OpenRA's known weakness in large battles)
- Memory safety without runtime cost
- Fearless concurrency for parallel ECS systems
- First-class WASM compilation target (browser, modding sandbox)
- Modern tooling (cargo, crates.io, clippy, miri)
- No competition in Rust RTS space — wide open field

**Why not a high-level language (C#, Python, Java)?**

The goal is to extract maximum performance from the hardware. A game engine is one of the few domains where you genuinely need every cycle — the original Red Alert was written in C and ran close to the metal, and IC should too. High-level languages with garbage collectors, runtime overhead, and opaque memory layouts leave performance on the table. Rust gives the same hardware access as C without the footguns.

**Why not C/C++?**

Beyond the well-known safety and tooling arguments: **C++ is a liability in the age of LLM-assisted development.** This project is built with agentic LLMs as a core part of the development workflow. With Rust, LLM-generated code that compiles is overwhelmingly *correct* — the borrow checker, type system, and ownership model catch entire categories of bugs at compile time. The compiler is a safety net that makes LLM output trustworthy. With C++, LLM-generated code that compiles can still contain use-after-free, data races, undefined behavior, and subtle memory corruption — bugs that are dangerous precisely because they're silent. The errors are cryptic, the debugging is painful, and the risk compounds as the codebase grows. Rust's compiler turns the LLM from a risk into a superpower: you can develop faster and bolder because the guardrails are structural, not optional.

This isn't a temporary advantage. LLM-assisted development is the future of programming. Choosing a language where the compiler verifies LLM output — rather than one where you must manually audit every line for memory safety — is a strategic bet that compounds over the lifetime of the project.

**Why Rust is the right moment for a C&C engine:**

Rust is replacing C and C++ across the industry. It's in the Linux kernel, Android, Windows, Chromium, and every major cloud provider's infrastructure. The ecosystem is maturing rapidly — crates.io has 150K+ crates, Bevy is the most actively developed open-source game engine in any language, and the community is growing faster than any systems language since C++ itself. Serious new infrastructure projects increasingly start in Rust rather than C++.

This creates a unique opportunity for a C&C engine renewal. The original games were written in C. OpenRA chose C# — a reasonable choice in 2007, but one that traded hardware performance for developer productivity. Rust didn't exist as a viable option then. It does now. A Rust-native engine can match C's performance, exceed C#'s safety, leverage Rust's excellent concurrency model to use all available CPU cores, and tap into a modern ecosystem (Bevy, wgpu, serde, tokio) that simply has no C++ equivalent at the same quality level. The timing is right: Rust is mature enough to build on, young enough that the RTS space is wide open, and the C&C community deserves an engine built with the best tools available today.

**Alternatives considered:**
- C++ (manual memory management, no safety guarantees, build system pain, dangerous with LLM-assisted workflows — silent bugs where Rust would catch them at compile time)
- C# (would just be another OpenRA — no differentiation, GC pauses in hot paths, gives up hardware-level performance)
- Zig (too immature ecosystem for this scope)
