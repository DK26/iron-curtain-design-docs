# Embark Studios — Rust Game Development Analysis

> **Research for:** Iron Curtain engine  
> **Date:** 2026-02-15  
> **Sources:** GitHub repositories under `EmbarkStudios/` and `Rust-GPU/` orgs, project documentation, Cargo.toml files, and architecture docs

## Executive Summary

Embark Studios (Stockholm, Sweden) is the most significant Rust game studio to date — founded by ex-DICE/Battlefield developers who bet their entire technology stack on Rust for game development. They have published 30+ open source Rust crates, explored Rust GPU programming, built production-grade UDP proxying infrastructure, and provided the most honest public assessment of the Rust gamedev ecosystem's strengths and gaps. Their experience validates many of Iron Curtain's architectural choices while offering concrete warnings about where Rust game development remains difficult.

**Key takeaway:** Embark's trajectory — from radical Rust-for-everything ambition to pragmatic "Rust where it excels, C++ where necessary" — offers critical lessons for IC. Their successes (quilkin, cargo-deny, puffin) were in areas where Rust's strengths naturally align. Their struggles (rust-gpu archived, kajiya unmaintained) were in areas where the Rust ecosystem lacks depth or where C++ interop friction dominates.

---

## 1. rust-gpu — Rust as a GPU Shader Language

**Repository:** `EmbarkStudios/rust-gpu` (7,588★, **archived** → transferred to community `Rust-GPU/rust-gpu`)  
**License:** MIT/Apache-2.0

### What It Did

rust-gpu compiled standard Rust code to SPIR-V, enabling Rust to be used as a shader language for Vulkan GPU compute and graphics pipelines. It works as a custom `rustc` codegen backend (the same mechanism as `rustc_codegen_cranelift` and `rustc_codegen_gcc`), plugging into the compiler via `-Z codegen-backend`.

### Why It Was Archived

Embark transferred rust-gpu to a community-run `Rust-GPU` GitHub organization in 2024. The archival was **not** a failure judgment — it was Embark recognizing that:

1. **The project was too ambitious for a single studio to maintain long-term.** It requires tracking `rustc` nightly internals, which break regularly. The codegen backend API is unstable and undocumented.
2. **Embark's internal priorities shifted.** By 2024, they had moved toward hybrid Rust/C++ approaches rather than pure-Rust rendering pipelines. The project was "graduated" to community ownership rather than abandoned.
3. **The project remains in "early stage" and is not production-ready** — it explicitly states there's no backward compatibility guarantee and only supports building from `main`.

### Lessons for Iron Curtain

- **Don't write GPU shaders in Rust.** Use HLSL/WGSL/GLSL for shaders and Rust for everything else. The Rust GPU ecosystem is years from production readiness. IC's decision to use Bevy's existing wgpu shader pipeline (D002, D017) is validated.
- **Tracking `rustc` internals is a maintenance trap.** Any project that depends on unstable compiler internals (like codegen backends) requires enormous ongoing effort. IC should use stable Rust features only.
- **Community handoffs can preserve projects.** rust-gpu continues active development under the Rust-GPU org. IC's open-source model (D051 GPL v3 + modding exception) should plan for eventual community governance (D037).

---

## 2. kajiya — Experimental Real-Time Renderer

**Repository:** `EmbarkStudios/kajiya` (5,274★, **unmaintained**)  
**License:** MIT/Apache-2.0

### Architecture

kajiya is a real-time global illumination renderer using Rust and Vulkan (via `ash`). Key architectural features:

- **Hybrid rendering pipeline:** Rasterization for G-buffer, compute shaders for lighting, ray tracing for GI — all orchestrated by a Rust-side render graph
- **G-buffer packing:** Single RGBA32 image stores albedo (8:8:8), normal (11:10:11), roughness/metalness (2xf16), emissive (rgb9e5)
- **ReSTIR-based sample reuse:** Sophisticated spatiotemporal resampling for real-time global illumination with half-resolution ray tracing
- **Irradiance cache:** Camera-aligned 32x32x32 clip maps with sparse allocation (max 65536 entries), on-demand voxel allocation/deallocation
- **Performance:** Renders 1920x1080 in 8.4ms on Radeon RX 6800 XT

### Key Observation: "Spare-time project by one person"

The README explicitly states: *"This project is no longer maintained. It was a spare-time experiment by one guy who worked at Embark at the time (on non-rendering stuff)."* Despite this, it achieved impressive results in real-time GI. This demonstrates:

1. **Rust is viable for high-performance rendering code** — the performance numbers are competitive with C++ GI implementations
2. **But the ecosystem for serious rendering is thin** — kajiya had to wrap Vulkan directly via `ash` and use HLSL shaders (not Rust), compile DirectXShaderCompiler via `hassle-rs`, and handle memory management through `gpu-allocator`
3. **Rust's safety guarantees were partially suspended** — the README admits "Vulkan API usage is extremely basic. Resources are usually not released."

### Lessons for Iron Curtain

- **Bevy's rendering abstraction is the right call for IC.** kajiya's hand-rolled Vulkan wrapper demonstrates the massive effort required to build a renderer from scratch. Bevy's wgpu-based pipeline gives IC the GL 3.3 fallback path (D017, invariant 4) that kajiya lacked (it was RTX-only).
- **Render graph pattern is proven.** kajiya's render graph approach aligns with IC's plan for composable render passes. This pattern works well in Rust.
- **Half-resolution tracing + temporal accumulation is the performance pattern.** kajiya's approach of tracing at lower resolution and using temporal superresolution is exactly the kind of optimization IC's performance hierarchy (D015) would employ.
- **Known issues list is instructive.** kajiya's honest assessment of problems (light leaking, temporal instability at thin geometry, noisy disoccluded areas) maps to the exact rendering challenges IC will face with isometric sprite rendering at varied zoom levels.

---

## 3. quilkin — UDP Proxy for Game Servers ★★★ DIRECTLY RELEVANT

**Repository:** `EmbarkStudios/quilkin` (1,510★, **active, beta, production use**)  
**License:** Apache 2.0  
**Co-developed with Google Cloud Gaming**

### Architecture Overview

Quilkin is a **non-transparent UDP proxy** designed for multiplayer game server deployments. It is directly relevant to IC's relay server architecture (D007). Key architecture:

```
Player → [Client Proxy] → Internet → [Server Proxy] → Game Server
                                         ↑
                                    xDS Control Plane
```

Three core components:
1. **Providers** — Data sources (Kubernetes, filesystem, CLI) that inform Quilkin about its environment
2. **Services** — Core UDP proxying, QCMP (Quilkin Control Message Protocol) for latency measurement
3. **Configuration** — Filter chains, endpoints, game server registration

### Filter Chain Architecture — Directly Applicable to IC

Quilkin's most transferable concept is its **filter chain** — a composable pipeline for packet processing:

```
incoming packet → Filter₁ → Filter₂ → ... → Filterₙ → destination
```

Filters are bidirectional (read path and write path are traversed in reverse order). Built-in filters include:

| Filter             | Description                                  | IC Relevance             |
| ------------------ | -------------------------------------------- | ------------------------ |
| **Capture**        | Extract bytes from packet, store in metadata | Order validation (D012)  |
| **Concatenate**    | Append authentication tokens                 | Player authentication    |
| **Firewall**       | Allow/block by IP and port                   | Anti-cheat (D006)        |
| **LoadBalancer**   | Distribute packets among endpoints           | Relay server scalability |
| **LocalRateLimit** | Limit packet frequency                       | Anti-flood protection    |
| **TokenRouter**    | Route packets based on metadata tokens       | Session routing          |
| **Timestamp**      | Observe packet age from UNIX timestamp       | Sub-tick ordering (D008) |
| **Debug**          | Log every packet                             | Desync diagnosis         |

**Filter dynamic metadata** allows filters to share per-packet context without coupling:
- A `Capture` filter extracts a routing token from the packet
- A `TokenRouter` filter reads that token to decide the destination endpoint
- Filters are completely independent — they communicate only through typed metadata

### Session Management

Quilkin automatically creates sessions on first packet (no handshake protocol):
- Session identified by 4-tuple: `(client_IP, client_port, server_IP, server_port)`
- Sessions auto-expire after 60 seconds of inactivity
- Sessions created *after* filter chain runs (dropped packets never create sessions)

### QCMP Protocol — Latency Measurement

Quilkin defines its own control protocol (QCMP) for measuring latency:
- Binary format with magic header `"QLKN"`, protocol version, packet type
- Ping packets carry nonce + client-sent timestamp (nanosecond UTC)
- Replies carry nonce + client-sent time + server-receive time + server-sent time
- Datacentre latency measurement using ICAO airport codes for human-readable geo-identifiers
- HTTP API returns JSON with datacenter ICAO codes → latency in nanoseconds

### High-Performance I/O

Quilkin v0.10 uses **platform-specific I/O acceleration**:
- **Linux:** `io-uring` for async I/O + XDP (eXpress Data Path) for kernel-bypass packet processing
- **Memory allocators:** jemalloc (default) or mimalloc as feature flags
- **Async runtime:** Tokio with multi-threaded scheduler
- **Hash function:** `gxhash` (3.5x faster than default Rust hasher)

### Metrics & Observability

Quilkin exposes comprehensive Prometheus metrics:
- `quilkin_packets_processing_duration_seconds{event, asn, ip_prefix}` — Histogram
- `quilkin_packets_dropped_total{reason}` — Counter with reason codes
- `quilkin_bytes_total{event}` — Read/write byte counters
- `quilkin_packet_jitter{event}` — Inter-packet timing
- `quilkin_session_active{asn, organization, country_code}` — With MaxmindDB GeoIP enrichment
- `quilkin_filter_read_duration_seconds{filter}` — Per-filter performance
- Generic filter metrics with configurable labels (`id`, `label`, `help`, `direction`)

### Deployment Patterns

Three progressively complex patterns:

1. **Sidecar** — Quilkin runs alongside each game server (simplest, least features)
2. **Client + Sidecar** — Client proxy for client-side filtering + sidecar for server-side
3. **Client + Separate Proxy Pool** — Full mediated architecture with xDS control plane, token-based routing, and public proxies hiding private game servers (most secure, most complex)

### Lessons for Iron Curtain's Relay Server (D007)

1. **Filter chain architecture is the right pattern for IC's relay.** IC should implement a similar composable pipeline for order validation (D012), sub-tick timestamps (D008), replay recording, and anti-cheat. The filter pattern decouples these concerns without coupling relay code to game logic — honoring the sim/net boundary.

2. **Session-based routing without handshakes works for UDP games.** Quilkin proves that stateless session creation (from first packet) is viable at scale. IC can adopt this pattern — the relay creates a session when it sees the first order packet from a client, with token-based routing determining which game server receives it.

3. **QCMP-style latency measurement protocol.** IC should implement something similar — a lightweight ping protocol on the relay server port that clients use to measure latency to each relay, enabling smart server selection. The three-timestamp design (client-sent, server-received, server-sent) is exactly what's needed for latency estimation without clock synchronization.

4. **MaxmindDB GeoIP integration for metrics.** Quilkin enriches all metrics with ASN/country/IP-prefix data from MaxmindDB. IC's observability layer (D031) should consider this for understanding player geographic distribution and detecting geographic anomalies.

5. **XDP/io-uring for high-throughput packet processing.** While IC's relay won't need the throughput of an FPS game, knowing that this path exists means IC can start with Tokio-based I/O and have a clear upgrade path if needed.

6. **Token-based routing pattern.** Quilkin's model where clients include authentication tokens in packets (appended by the client proxy, validated by the server proxy, stripped before delivery to the game server) maps directly to IC's relay authentication model. The game server never sees the auth infrastructure.

7. **Envoy Proxy as design inspiration.** Quilkin explicitly credits Envoy Proxy for architectural inspiration. IC should study both Quilkin and Envoy when designing the relay server filter pipeline.

---

## 4. cargo-deny — Dependency Linting

**Repository:** `EmbarkStudios/cargo-deny` (2,204★, **active, well-maintained**)  
**License:** MIT/Apache-2.0

### What It Does

Four categories of dependency checks:
1. **Licenses** — Verify all transitive dependencies have acceptable licenses
2. **Bans** — Deny/allow specific crates, detect duplicate versions
3. **Advisories** — Check against the RustSec advisory database for known vulnerabilities
4. **Sources** — Ensure crates only come from trusted registries

### Lessons for Iron Curtain

- **IC must use cargo-deny from day one.** GPL v3 (D051) requires careful license compatibility checking of all dependencies. cargo-deny automates this. A single `cargo deny check licenses` in CI catches license-incompatible dependencies before they're merged.
- **Ban duplicate crate versions.** Large Rust projects (IC will be one) easily accumulate multiple versions of the same crate. `cargo deny check bans` catches this.
- **Advisory database checks are critical for a security-conscious project.** IC's security design (D006) depends on knowing about supply chain vulnerabilities.
- **GitHub Action available:** `cargo-deny-action` can be added to CI with one YAML block.
- **SPDX support is built-in.** IC's Workshop resource registry (D030) requires SPDX licensing — cargo-deny already uses SPDX expression parsing via Embark's `spdx` crate.

---

## 5. puffin — Instrumentation Profiler

**Repository:** `EmbarkStudios/puffin` (1,674★, **active**)  
**License:** MIT/Apache-2.0

### Architecture

Puffin is a lightweight instrumentation profiler designed specifically for game loops:

```rust
fn my_function() {
    puffin::profile_function!();  // ~54ns overhead when on, ~1ns when off
    // ...
    if condition {
        puffin::profile_scope!("load_image", image_name);
        // ...
    }
}
```

Key design principles:
- **Thread-local data streams:** Each thread writes profiling events to its own stream, avoiding synchronization
- **Frame-based collection:** `GlobalProfiler::lock().new_frame()` flushes per-thread data to a central collector each frame
- **Atomic on/off switch:** `set_scopes_on(bool)` controls whether macros record data; when off, the cost is a single `AtomicBool` load (~1ns)
- **Scope IDs use `OnceLock`:** Each profiling site registers once, then reuses its `ScopeId` — amortized registration cost
- **`!Send` profiler scopes:** `ProfilerScope` uses `PhantomData<*const ()>` to prevent async task migration — scopes must start and stop on the same thread
- **Remote profiling via TCP:** `puffin_http` streams profiling data to a separate `puffin_viewer` application
- **egui integration:** `puffin_egui` renders flamegraphs in-game

### Conditional Profiling

```rust
fn do_work(num_jobs: usize) {
    puffin::profile_function_if!(num_jobs > 1000);  // Only profile when expensive
    // ...
}
```

This pattern avoids profiling overhead for functions that are sometimes fast and called very frequently — exactly the pattern IC needs for per-unit processing in the simulation.

### Lessons for Iron Curtain (D031 Observability)

1. **Frame-based profiling is the right model for game loops.** Puffin's `new_frame()` approach maps directly to IC's fixed-timestep simulation. Each sim tick is a "frame" for profiling purposes.

2. **Zero-cost-when-off is achievable.** Puffin proves that a single `AtomicBool` check per scope entry (Relaxed ordering) adds negligible overhead. IC's profiling should follow this pattern — always compiled in, but only active when explicitly enabled.

3. **Thread-local streams avoid contention.** For IC's sim (which is primarily single-threaded per invariant 5), this is ideal. Even if IC later adds `par_iter()` for specific systems, each Rayon worker thread gets its own stream.

4. **Remote profiling is essential for headless/server scenarios.** IC's relay server and dedicated server modes need profiling without a GUI. Puffin's TCP streaming model is exactly what's needed.

5. **Consider puffin directly as a dependency.** Rather than building custom profiling, IC could use puffin (or the `profiling` crate that abstracts over puffin and others). The 54ns overhead per scope is well within IC's performance budget, and the egui integration would work with Bevy's egui plugin.

6. **`!Send` enforcement on profiler scopes is important.** IC's deterministic sim (invariant 1) runs in `FixedUpdate` on a single thread. Profiler scopes that accidentally migrate to another thread would produce corrupt flame graphs. Puffin's `PhantomData<*const ()>` trick is a zero-cost way to enforce this.

---

## 6. texture-synthesis — Example-Based Texture Generation

**Repository:** `EmbarkStudios/texture-synthesis` (1,801★, **maintenance mode**)  
**License:** MIT/Apache-2.0

### What It Does

Implements *Multiresolution Stochastic Texture Synthesis* — generates new textures from example images without neural networks. Features: single/multi-example generation, guided synthesis, style transfer, inpainting, tiling texture generation.

### Status

The README states: *"We at Embark are not actively using or developing these crates and would be open to transferring them."* This is a common pattern — Embark built tools for specific project needs, then moved on.

### Lessons for Iron Curtain

- **Texture synthesis as an asset generation tool (D016).** If IC's LLM-generated missions need terrain textures, this algorithm could generate tileable terrain textures from small examples. However, this is Phase 7 territory and not a priority.
- **The "maintenance mode" warning applies broadly.** Embark's pattern of creating tools, using them internally, then stopping maintenance is a risk for any dependency IC takes on Embark crates. Prefer crates with active community maintainers.
- **Deterministic output requires single-threaded mode.** texture-synthesis explicitly notes that multi-threaded generation is non-deterministic. This echoes IC's determinism requirements (invariant 1) — any procedural generation IC uses must be single-threaded or use deterministic parallelism.

---

## 7. physx-rs — C++ Library Wrapping Patterns

**Repository:** `EmbarkStudios/physx-rs` (726★, **active**)  
**License:** MIT/Apache-2.0 (Rust bindings), BSD-3 (PhysX SDK)

### Architecture: The Two-Layer Pattern

physx-rs demonstrates the canonical pattern for wrapping large C++ libraries in Rust:

**Layer 1: `physx-sys` (unsafe, auto-generated)**
- Custom C++ tool (`pxbind`) uses `clang` libtooling to extract metadata from PhysX C++ API
- Generates a **C wrapper** as an ABI-stable intermediary (C++ has no stable ABI)
- `structgen` program runs against actual compiler to extract exact struct layouts per target platform
- Platform-specific generated bindings under `generated/unix/` and `generated/x86_64-pc-windows-msvc/`
- All function pointers wrapped in `Option<>` for nullable callback support (compiler optimizes to plain pointer)

**Layer 2: `physx` (safe, hand-written)**
- Uses the **deref pattern** to simulate C++ inheritance:
  ```rust
  // RigidDynamic derefs to RigidBody, which provides set_angular_damping
  let mut sphere: RigidDynamic = physics.create_dynamic(..);
  sphere.set_angular_damping(0.5);  // Actually calling RigidBody method
  ```
- `PxType<T>` pointer wrapper for type-safe access to opaque C++ objects
- Ownership semantics mapped to Rust (creation/destruction follows RAII)

### Build System Complexity

The build pipeline is non-trivial:
1. `pxbind` → generates `physx_generated.{hpp,rs}` and `structgen.cpp`
2. `structgen` → compiled against PhysX SDK → generates `structgen_out.{hpp,rs}` with exact memory layouts
3. C wrapper compiled into `physx_api` static library
4. Rust links with PhysX + C wrapper

**Windows warning:** Debug info in release mode makes PhysX C++ compilation "extremely long" — they explicitly recommend `[profile.release.package.physx-sys] debug = false`.

### Lessons for Iron Curtain

- **IC's `ra-formats` crate doesn't need this pattern.** IC reads C&C file formats from data files, not through a C++ API. The physx-rs pattern is relevant only if IC ever needs to wrap a C++ library (unlikely given the Bevy ecosystem).
- **The deref pattern for inheritance simulation is well-proven.** If IC's game module system (D018) needs inheritance-like component hierarchies, this pattern works — but Bevy's ECS composition model is preferable.
- **Platform-specific struct layouts are a real concern for C FFI.** If IC ever exposes a C API (for the WASM sandbox boundary in D005), struct layout verification is essential.
- **Build time is a genuine concern with C++ dependencies.** IC's decision to stay pure-Rust (D001) avoids this entirely. The physx-rs experience validates that decision.

---

## 8. rust-ecosystem — The Honest Assessment

**Repository:** `EmbarkStudios/rust-ecosystem` (1,008★)

### Embark's Areas of Active Investment

1. **Distributed systems** — async, tokio, tonic (gRPC)
2. **Game engine systems** — multiplayer, rendering, physics, audio, server, assets, workflows
3. **Developer experience** — fast iteration with large monorepos, distributed builds, debugging, profiling, IDE
4. **WebAssembly and WASI** — sandboxed Rust on client, edge, and cloud
5. **Machine learning** — efficient inference, library bindings, training environments
6. **High performance runtime** — CPU job scheduling, code generation, optimizing crates
7. **Console and mobile** — PlayStation, Xbox, Android
8. **Rust on GPU** — future compute and ML beyond shaders

### Open Issues: What Embark Finds Missing in Rust

The most upvoted issues reveal Embark's unresolved pain points:

| Issue      | Topic                                            | IC Relevance                                                                                                                              |
| ---------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| #22 (20 👍) | Global workspace-level Clippy lint configuration | IC's monorepo workspace will need this. Now partially resolved via `[workspace.lints.clippy]` in Cargo.toml (which quilkin already uses). |
| #11 (5 👍)  | Distributed compilation for fast iteration       | IC's build times will grow. sccache and cargo-remote are partial solutions.                                                               |
| #18 (4 ❤️)  | Console support (Xbox, PlayStation)              | IC targets desktop/web/mobile (invariant 10). Console Rust support is still NDA-restricted and unresolved as of 2026.                     |
| #41 (5 👍)  | Specify valid targets per workspace              | IC's multi-target strategy (WASM, Linux, Windows, macOS) would benefit from explicit target validation.                                   |
| #16 (3 👍)  | Warning on unused crate dependencies             | Useful for IC's dependency hygiene.                                                                                                       |
| #59 (5 ❤️)  | Standard lint configuration                      | IC should adopt similar workspace-level lint configuration.                                                                               |

### Development Guidelines

Embark's published guidelines include:

1. **Run rustfmt on save** — Non-negotiable baseline. IC should do the same.
2. **Use `parking_lot` instead of `std::sync`** — Faster, smaller, no poisoning errors. Quilkin uses `parking_lot = "0.12.5"`. IC should adopt this for any synchronization primitives outside the sim.
3. **Opt-in Clippy with `#![warn(clippy::all)]`** — Applied to every crate. Quilkin goes further with `[workspace.lints.clippy] undocumented_unsafe_blocks = "deny"`.

### Relevant Crates Not in the Core Eight

Several other Embark crates are directly useful:

| Crate               | Description                                 | IC Use Case                                  |
| ------------------- | ------------------------------------------- | -------------------------------------------- |
| `cargo-about`       | Generate license lists for all dependencies | IC's GPL compliance (D051)                   |
| `spdx`              | SPDX expression parser                      | IC's Workshop resource licensing (D030)      |
| `crash-handling`    | Cross-platform crash catching               | IC's error reporting                         |
| `discord-sdk`       | Open Discord Game SDK implementation        | IC's community integration                   |
| `poll-promise`      | Rust promise for games/immediate mode GUIs  | IC's async UI operations                     |
| `presser`           | Low-level data copy helper                  | IC's zero-allocation hot paths (invariant 5) |
| `rpmalloc-rs`       | Cross-platform global allocator             | IC's memory allocator strategy               |
| `superluminal-perf` | Superluminal profiler integration           | IC's performance profiling                   |
| `tiny-bench`        | Tiny benchmarking library                   | IC's micro-benchmarks                        |
| `tryhard`           | Retry futures with backoff                  | IC's network retry logic                     |
| `tracing-logfmt`    | Logfmt formatter for tracing                | IC's structured logging                      |
| `cervo`             | ML inference middleware                     | IC's ML-assisted AI (D044, Phase 7)          |

---

## Cross-Cutting Themes: What Embark Learned

### Theme 1: Rust Excels at Infrastructure, Struggles with Creative Tooling

Embark's most successful projects are **infrastructure** (quilkin, cargo-deny, puffin, cargo-about, spdx). Their creative/engine projects (rust-gpu, kajiya, texture-synthesis) are all archived, unmaintained, or in maintenance mode.

**Lesson for IC:** The engine infrastructure (networking, profiling, asset parsing, build pipeline) can be built confidently in Rust. The creative tools (scenario editor D038, asset studio D040) should lean heavily on Bevy's existing UI ecosystem rather than building from scratch.

### Theme 2: The Two-Speed Ecosystem

Embark operates at two speeds:
- **Fast lane:** `async`, `serde`, `tokio`, `tonic`, `clap`, `tracing` — mature, production-ready
- **Slow lane:** GPU/rendering, audio, game-specific middleware — immature, fragmented, often requiring C++ interop

**Lesson for IC:** IC's dependency strategy should distinguish between "fast lane" crates (use freely) and "slow lane" areas (proceed cautiously, vendor if necessary). For IC specifically: networking infra = fast lane; audio (P003) = slow lane.

### Theme 3: Observability Is Solved in Rust

Between puffin (profiling), tracing (structured logging), prometheus (metrics), and Quilkin's comprehensive metrics pipeline, Embark demonstrates that Rust's observability tooling is mature and production-grade.

**Lesson for IC:** D031 (observability via OTEL) is achievable with existing crates. The tracing + prometheus stack is battle-tested. IC's "zero cost when disabled" requirement (D031) is satisfied by puffin's `AtomicBool` pattern and tracing's compile-time level filtering.

### Theme 4: Async Rust Is Production-Ready for Game Networking

Quilkin is proof that `tokio` + `tonic` + async Rust handles production game server traffic. Quilkin is used in production at Embark and Google Cloud Gaming.

**Lesson for IC:** IC's relay server (D007) can confidently use Tokio for async I/O. The concern that async Rust is "too complex for game networking" is disproved by Quilkin's successful deployment.

### Theme 5: C++ Interop Works but Is Painful

physx-rs demonstrates that wrapping C++ libraries is possible but requires:
- Custom code generation tools
- Platform-specific struct layout extraction
- Two-layer (unsafe-sys + safe-wrapper) architecture
- Significant build system complexity
- Ongoing maintenance tracking upstream C++ changes

**Lesson for IC:** IC's "pure Rust" strategy (D001) avoids all of this pain. The only C/C++ interop IC might need is through Bevy's own dependencies (wgpu, etc.), which are maintained by the Bevy community.

### Theme 6: Memory Allocators Matter for Game Performance

Quilkin offers both jemalloc and mimalloc as feature flags. Embark also maintains `rpmalloc-rs` bindings. This reflects a lesson learned: the default Rust allocator is not optimal for game workloads.

**Lesson for IC:** IC should benchmark with jemalloc or mimalloc, especially for the sim (where many small allocations occur during pathfinding and order processing). This fits IC's performance hierarchy (D015) — better algorithms first, then allocator tuning.

### Theme 7: Testing Matters More Than Documentation

Quilkin's Cargo.toml includes robust test infrastructure (`tracing-test`, `pretty_assertions`, `tempfile`). Their benchmark profile enables debug info for correct profiling callstacks. This reflects a "test in production conditions" philosophy.

**Lesson for IC:** IC should adopt `[profile.bench] debug = true` for meaningful profiling, and use `tracing-test` for verifying log output in integration tests.

---

## Recommended Actions for Iron Curtain

### Immediate (Phase 0-1)

1. **Add `cargo-deny` to CI** with license checking configured for GPL v3 compatibility
2. **Adopt `[workspace.lints.clippy]` configuration** following Embark's pattern (quilkin's `Cargo.toml` is a good template)
3. **Add `parking_lot` to standard dependencies** for any synchronization outside `ic-sim`
4. **Evaluate `puffin` for profiling** — its frame-based model fits IC's sim loop perfectly

### Medium-term (Phase 2-3)

5. **Study Quilkin's filter chain for relay server design** — implement IC's relay as a composable filter pipeline (order validation → sub-tick timestamps → replay recording → forwarding)
6. **Implement QCMP-style latency measurement** on IC's relay servers for client-side server selection
7. **Add `tracing` + `prometheus` for observability** (D031) — the stack is proven

### Long-term (Phase 5+)

8. **Consider Quilkin as a starting point for IC's relay server** — it's Apache-2.0 licensed, production-proven, and purpose-built for UDP game traffic. IC would need to add lockstep-specific logic but the infrastructure (session management, filtering, metrics, deployment patterns) is directly reusable.
9. **Token-based routing from Quilkin** maps to IC's relay authentication model — clients include session tokens in order packets, the relay validates and routes them.

---

## References

- Quilkin documentation: https://embarkstudios.github.io/quilkin/
- Quilkin Google Cloud announcement: https://cloud.google.com/blog/products/gaming/introducing-quilkin
- Embark Medium (kajiya announcement): https://medium.com/embarkstudios/homegrown-rendering-with-rust-1e39068e56a7
- physx-rs Stockholm Rust Meetup talk: https://www.youtube.com/watch?v=RxtXGeDHu0w
- texture-synthesis talk: https://www.youtube.com/watch?v=fMbK7PYQux4
- Embark open source portal: https://embark.dev
- Embark crates.io profile: https://crates.io/users/embark-studios
- rust-gpu (community continuation): https://github.com/Rust-GPU/rust-gpu
