# WASM Server-Side Exploration — Feasibility Analysis

> **Status:** Research note (not a decision). Explores whether WASM-based server runtimes (WASI, Spin, wasmCloud, SpinKube) offer advantages over traditional container deployment for IC's backend services.
>
> **Date:** 2026-03
>
> **Related decisions:** D007 (relay), D034 (SQLite), D072 (server management), D074 (unified binary)

---

## 1. Context: IC's Current Server Architecture

IC ships a **single Rust binary** (`ic-server`) with six independently toggleable capabilities (D074):

| Capability      | State model                        | I/O pattern                                                   | Persistence                                            |
| --------------- | ---------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------ |
| **Relay**       | Per-game session state in memory   | Persistent WebSocket/UDP connections, sub-ms latency critical | SQLite (match results, replay metadata)                |
| **Tracker**     | Ephemeral listings in memory       | Request-response (REST/WebSocket), TTL expiry                 | None — pure in-memory with heartbeat                   |
| **Workshop**    | BitTorrent swarm state, piece maps | Long-lived TCP/uTP/WebRTC peer connections                    | SQLite (package metadata), filesystem (`.icpkg` blobs) |
| **Ranking**     | Glicko-2 player ratings            | Request-response + event-driven (match result callbacks)      | SQLite (ratings, SCRs, season history)                 |
| **Matchmaking** | Queue state in memory              | Persistent connections (waiting players)                      | SQLite (queue analytics)                               |
| **Moderation**  | Review queue, case history         | Mixed (review submission + async processing)                  | SQLite (cases, verdicts)                               |

The core deployment philosophy is **"Just a Binary"** (D072): download, run, server is live. Docker and Kubernetes are optional layers for operators who want horizontal scaling. The target operator persona is a "$5 VPS community member" — not a professional SRE team.

---

## 2. WASM Server Runtime Landscape (2026)

The WASM server-side ecosystem has matured significantly since its WebAssembly System Interface (WASI) origins. Key platforms:

### 2a. WASI Preview 2 / Component Model

**What it is:** The standardized system interface for WASM modules running outside the browser. WASI Preview 2 (2024+) introduced the Component Model — typed interfaces between modules with strong sandboxing guarantees.

**Rust support:** `wasm32-wasip2` target in stable Rust. `cargo component` tooling for building WASI components. The Bytecode Alliance's `wasmtime` (already an IC dependency for Tier 3 mods) is the reference runtime.

**Key constraints:**
- **No raw socket access.** WASI networking uses `wasi:sockets` — currently limited to TCP streams and UDP datagrams. No `epoll`/`io_uring`/IOCP. No `mio`/`tokio` out of the box.
- **No filesystem persistence guarantees.** WASI filesystem access is capability-gated and ephemeral by default.
- **No native SQLite.** `rusqlite` links against C code via `cc`/`bindgen`. Compiling SQLite to WASM is possible (`sqlite-wasm`) but with significant performance overhead and no WAL mode (no shared memory in WASM).
- **No threads (yet).** WASI threads proposal is in progress but not widely deployed. Single-threaded execution only.
- **Cold start:** ~1-5ms for small modules, ~10-50ms for larger ones. Faster than containers (~100-500ms) but not zero.

### 2b. Application Frameworks

| Framework              | Model                                                                                 | Notable properties                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fermyon Spin**       | Request-response handlers compiled to WASM. HTTP trigger → WASM component → response. | Sub-millisecond cold start, built-in key-value/SQLite storage (Spin's own, not raw `rusqlite`), Redis/Postgres outbound connectors, composable components. |
| **wasmCloud**          | Actor model with capability providers. WASM actors communicate via NATS messaging.    | Lattice-based distribution, hot-swappable capability providers, declarative linking, NATS dependency.                                                      |
| **Cloudflare Workers** | V8 isolates (not pure WASM, but runs WASM).                                           | Global edge network, <5ms cold start, Workers KV / Durable Objects for state, 128MB memory limit, CPU time limits (10-50ms free tier).                     |
| **Fastly Compute**     | Pure WASM on Lucet/Wasmtime.                                                          | Edge compute, <1ms startup, KV store, limited outbound networking.                                                                                         |

### 2c. Kubernetes Integration

**SpinKube** (`spin-operator` + `containerd-shim-spin`): Runs Spin applications as Kubernetes pods. The `containerd-shim-spin` is a containerd shim that executes WASM modules instead of OCI containers. WASM workloads appear as normal pods to Kubernetes — same networking, service mesh, autoscaling, monitoring. Mixed-mode clusters can run WASM pods alongside traditional container pods.

**Benefits over containers:**
- ~10x faster cold start (ms vs. seconds)
- ~10-100x smaller image size (KB-MB vs. tens/hundreds of MB for container images)
- Stronger sandboxing than Linux containers (WASM memory model vs. namespace isolation)
- "Scale-to-zero" is practical when cold start is sub-millisecond

---

## 3. Per-Capability Fit Analysis

### Relay (order router) — **Poor fit**

The relay is IC's most latency-sensitive service. It maintains persistent WebSocket/UDP connections, buffers per-tick orders, enforces sub-tick timestamp ordering (D008), and detects lag switches in real-time. This requires:

- **Persistent connections:** WASI networking supports TCP streams but the ecosystem is optimized for request-response, not long-lived bidirectional channels.
- **Sub-millisecond processing:** The relay processes orders within a 33ms tick window. WASM's current overhead (function call boundary crossing, memory isolation) adds measurable latency in this context.
- **UDP forwarding:** The relay uses UDP for game traffic. WASI UDP support exists but is immature and untested at scale.
- **SQLite persistence:** Match results and replay metadata are written to SQLite (D034). No viable WASM-native path for WAL-mode SQLite.
- **Conclusion:** The relay's real-time, stateful, connection-oriented nature is the antithesis of WASM server runtimes' strengths (stateless, request-response, fast startup).

### Tracker (game browser) — **Good fit**

The tracking server is explicitly called out in `tracking-backend.md` as "the only backend service with truly ephemeral data." Its properties:

- **Stateless request-response:** `browse()`, `publish()`, `update()`, `unpublish()` are pure request-response operations.
- **In-memory with TTL:** No database. Listings expire if the host stops sending heartbeats.
- **Horizontally scalable:** Already designed for stateless replicas behind a load balancer.
- **Low compute:** Listing filtering and heartbeat management require minimal CPU.
- **WASM-compatible storage:** Spin's built-in key-value store (with TTL) maps directly to the tracker's in-memory listing store. No SQLite needed.

**Specific benefits of WASM deployment:**
- **Edge compute:** Deploy tracker replicas to Cloudflare Workers or Fastly Compute edge locations. Players hit the nearest edge node for browse requests — lower latency than a centralized server.
- **Scale-to-zero:** Small communities don't pay for idle compute. Tracker instances spin up on first request.
- **Cost:** Edge WASM platforms often have generous free tiers. A community tracker serving <100K requests/month could run for free.

**Caveats:**
- **Heartbeat tracking:** The tracker needs to track listing TTLs. In a scale-to-zero model, the "clock" doesn't tick when no requests arrive. Solutions: store heartbeat timestamps in KV and check on each `browse()` request, or use the platform's TTL-expiry feature directly.
- **Multi-instance consistency:** Multiple edge replicas need a shared listing store. Spin's key-value store with Redis backend, or Cloudflare Workers KV (eventually consistent), would work — but this is also solvable with the current Redis option in the existing design.
- **WebSocket subscriptions:** If the tracker offers WebSocket push notifications for lobby changes, WASM runtimes' request-response model doesn't support this natively. Mitigation: use polling with short intervals for the WASM-deployed tracker, keep WebSocket for traditional deployments.

### Workshop (P2P seeder) — **Poor fit**

The Workshop capability maintains long-lived BitTorrent peer connections, manages piece maps, performs choking/unchoking algorithms, and serves as a permanent seeder. WASM's request-response model and networking limitations make this impractical.

### Ranking — **Moderate fit**

Rating calculation is stateless computation, but it requires SQLite reads/writes for player records. If Spin's SQLite connector matures, individual rating queries could be WASM components. However, the ranking service also signs Signed Competition Records (SCRs) with Ed25519 keys — crypto operations in WASM are viable but key management in a sandboxed environment adds complexity.

### Matchmaking — **Poor fit**

Queue management requires persistent connections (players waiting in queue) and real-time state transitions. Same connection-oriented limitations as relay.

### Moderation — **Moderate fit**

Review submission and verdict recording are request-response. The review queue browser could be a WASM component. But the moderation system integrates tightly with ranking and match data via shared SQLite databases (D034), making extraction difficult.

---

## 4. Recommended Exploration Areas

### Area 1: Edge-Deployed Tracker (Highest Value)

**What:** Compile the `TrackingServer` trait implementation to `wasm32-wasip2`. Deploy as a Spin application. Use Spin's key-value store (Redis-backed) for listing storage. Deploy to Fermyon Cloud or a self-hosted SpinKube cluster.

**Why this is valuable:**
- The tracker is already designed as stateless, ephemeral-data, horizontally-scalable — the exact pattern WASM runtimes excel at.
- Edge deployment reduces browse latency for a globally distributed player base.
- Scale-to-zero eliminates cost for small communities during off-peak hours.
- Proves out IC's WASM server-side capabilities without touching any latency-critical service.

**Implementation sketch:**
```rust
// tracker-wasm/src/lib.rs
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2025–present Iron Curtain contributors

use spin_sdk::http::{IntoResponse, Request, Response};
use spin_sdk::key_value::Store;
use ic_protocol::{GameListing, BrowseFilter};

#[spin_sdk::http_component]
fn handle_request(req: Request) -> anyhow::Result<impl IntoResponse> {
    let store = Store::open_default()?;
    match (req.method(), req.path()) {
        ("GET", "/browse") => handle_browse(&store, &req),
        ("POST", "/publish") => handle_publish(&store, &req),
        ("PUT", "/heartbeat") => handle_heartbeat(&store, &req),
        ("DELETE", "/unpublish") => handle_unpublish(&store, &req),
        ("GET", "/health") => Ok(Response::new(200, r#"{"status":"ok"}"#)),
        _ => Ok(Response::new(404, "not found")),
    }
}
```

**Effort:** ~2-3 weeks (Phase 5 scope). Extract `TrackingServer` trait impl into a separate crate that compiles to both native and `wasm32-wasip2`.

**Risk:** Low. The tracker is the simplest service. Failure means falling back to the existing Rust binary deployment — zero impact on other capabilities.

### Area 2: WASM Component Model for Server Extensions (Medium Value)

**What:** Use the WASM Component Model to allow mod-provided server-side logic — tournament scoring plugins, custom matchmaking algorithms, moderation bots — running as sandboxed WASM components inside `ic-server`.

**Why this is valuable:**
- IC already uses `wasmtime` for client-side Tier 3 mods (D005). Extending this to server-side is a natural evolution.
- Server operators currently cannot run custom logic without modifying the binary. WASM components would enable downloadable server plugins with the same sandboxing guarantees as client mods.
- The Component Model's typed interfaces (WIT — WASM Interface Types) enforce clean API boundaries.

**Concrete use cases:**
- **Tournament scoring plugin:** Custom point allocation (round-robin, Swiss, double elimination) as a WASM component that receives match results and outputs standings.
- **Custom matchmaking:** Community-specific queue logic (e.g., map-weighted skill, faction-balanced teams) as a WASM component implementing IC's matchmaking interface.
- **Moderation bot:** Automated review of reported behavior using community-defined rules, running sandboxed inside the server.
- **Custom tracker filters:** Community-specific listing visibility rules (e.g., "only show games with mods from our approved list").

**Relationship to existing design:**
- D074's capability model already isolates services. WASM components would be a finer-grained isolation within capabilities.
- D041's trait-abstracted subsystem strategy (`AiStrategy`, `FogProvider`, `RankingProvider`, etc.) defines the interfaces these WASM components would implement.
- D071 (ICRP) already defines permission tiers for external tools. Server-side WASM extensions would slot into this model.

**Effort:** Phase 6a+ scope. Requires defining WIT interfaces for server extension points, building a server-side WASM host, and designing the distribution/trust model for server plugins.

**Risk:** Medium. The Component Model is still maturing. WIT tooling is usable but not fully stable. However, IC already depends on `wasmtime` — this extends an existing dependency rather than adding a new one.

### Area 3: SpinKube for Mixed-Mode K8s (Lower Value, Future)

**What:** For the official deployment and large-scale operators, run the tracker as a WASM workload via SpinKube alongside traditional container pods for relay/workshop/ranking.

**Why this is valuable:**
- Mixed-mode clusters let operators choose WASM or containers per-capability based on fit.
- WASM tracker pods start in milliseconds and consume minimal resources, improving cluster utilization.
- Demonstrates IC's forward-looking infrastructure posture.

**Caveats:**
- SpinKube adds cluster-level complexity (custom shim, operator installation) that conflicts with the "$5 VPS" philosophy.
- Only relevant for Kubernetes operators — a small subset of IC's server operator community.
- The tracker is already lightweight as a container (~5MB Rust binary, ~64MB memory). The marginal improvement from WASM is real but may not justify the operational complexity.

**Effort:** Phase 6a scope. Requires SpinKube testing, Helm chart updates, and documentation for mixed-mode deployment.

**Risk:** Low (it's additive). But low value relative to effort unless the operator community grows large enough to justify the investment.

---

## 5. What NOT to Do

### Do not WASM-ify the relay

The relay is the core of IC's multiplayer. It handles persistent connections, real-time order forwarding, sub-tick timestamp authority, lag switch detection, and replay signing. Every millisecond matters. WASM's memory isolation overhead, lack of raw socket control, and request-response optimization make it categorically wrong for this workload.

The relay binary is ~5-10MB. It uses ~2-10KB per game. It is already "scale-to-zero" in the sense that idle games consume near-zero resources. There is no problem here for WASM to solve.

### Do not make WASM a deployment requirement

D072's core philosophy is "Just a Binary." Any WASM deployment must be an **alternative** path, never a replacement. The `ic-server` Rust binary must remain the primary, recommended deployment. CommunityFriendliness means: download, run, done. Not: install wasmtime, configure WASI capabilities, manage component linking, debug WASM-specific networking issues.

### Do not use WASM server runtimes for SQLite-dependent services

D034 establishes SQLite as the universal persistent storage layer. WASM's SQLite story (no WAL mode, no shared memory, performance overhead, no `mmap`) means any service that relies on SQLite reads/writes is better served by the native binary. This rules out ranking, matchmaking, moderation, and workshop metadata as primary WASM targets.

### Do not conflate client-side WASM mods with server-side WASM services

IC's Tier 3 WASM mod system (D005) runs mod code inside the game client's `wasmtime` instance. This is a sandboxing strategy for untrusted code. Server-side WASM deployment is a different concern: it's about operational deployment models (containers vs. WASM runtimes), not code sandboxing. They share the `wasmtime` dependency but serve fundamentally different purposes.

### Do not adopt wasmCloud/NATS for IC

wasmCloud's actor model and mandatory NATS dependency add significant operational complexity. IC's server is designed as a single binary with embedded capabilities — not a distributed actor mesh. wasmCloud's architecture is interesting for microservice-heavy cloud applications but conflicts with IC's "Just a Binary" philosophy at every level.

---

## 6. Relationship to Existing Decisions

| Decision                                   | Impact                                                                                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D007 (relay server)**                    | Explicitly excluded from WASM deployment. Relay stays native.                                                                                           |
| **D034 (SQLite)**                          | SQLite-dependent capabilities stay native. Only the tracker (no SQLite) is a clean WASM candidate.                                                      |
| **D054 (extended switchability)**          | The `Transport` trait already abstracts transport for WASM browser multiplayer. Server-side WASM would use the same trait boundary.                     |
| **D072 (server management)**               | "Just a Binary" philosophy is preserved. WASM tracker is an additional deployment option, not a replacement.                                            |
| **D074 (unified binary)**                  | The unified binary remains canonical. A WASM-deployed tracker is an architectural variant, not a replacement for the tracker capability in `ic-server`. |
| **D005/D041 (WASM mods/trait subsystems)** | Server-side WASM extensions (Area 2) would extend the existing `wasmtime` dependency and trait-abstracted interfaces to server context.                 |

---

## 7. Summary & Recommendation

| Area                            | Fit       | Value                                            | Phase     | Decision                                       |
| ------------------------------- | --------- | ------------------------------------------------ | --------- | ---------------------------------------------- |
| **Edge-deployed tracker**       | Excellent | High (latency, cost, scale-to-zero)              | Phase 5   | **Explore — build a prototype**                |
| **WASM server extensions**      | Good      | Medium (extensibility, sandboxing)               | Phase 6a+ | **Design interfaces now, implement later**     |
| **SpinKube mixed-mode K8s**     | Adequate  | Low-Medium (marginal improvement)                | Phase 6a  | **Defer — revisit when K8s operator is built** |
| **WASM relay/workshop/ranking** | Poor      | Negative (added complexity, reduced performance) | Never     | **Reject**                                     |

The tracker is the one service where WASM server-side deployment offers clear, measurable benefits without fighting IC's architecture. Start there. Use it as a proving ground for WASM operational maturity. If successful, expand to server-side extensions (Area 2) where the WASM Component Model provides genuine sandboxing value for community-contributed server logic.

Everything else stays as a Rust binary. IC's "Just a Binary" philosophy works. Don't fix what isn't broken.

---

## References

- [WASI Preview 2 specification](https://github.com/WebAssembly/WASI/blob/main/preview2/README.md)
- [Fermyon Spin documentation](https://developer.fermyon.com/spin/v2)
- [SpinKube — WASM on Kubernetes](https://www.spinkube.dev/)
- [wasmCloud documentation](https://wasmcloud.com/docs)
- [Bytecode Alliance — wasmtime](https://wasmtime.dev/)
- [Cloudflare Workers WASM](https://developers.cloudflare.com/workers/runtime-apis/webassembly/)
- IC design docs: D007, D034, D054, D072, D074, `tracking-backend.md`, `wasm-modules.md`
