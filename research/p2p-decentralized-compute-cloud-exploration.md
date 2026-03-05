# Decentralized Compute Cloud — P2P Platform as Infrastructure Orchestrator

> **Purpose:** Exploratory research into whether the IC P2P platform primitives (D030, D049, D050, D076) can serve as the foundation for a decentralized "private cloud" — a Kubernetes-like compute orchestration layer where hosting itself is distributed across federated nodes rather than centralized in a single cluster.
>
> **Status:** Early exploration (March 2026). Documents the insight, maps existing primitives, identifies gaps, and scopes the R&D opportunity. This is NOT a committed design — it is a research artifact exploring a possible future direction.
>
> **Date:** 2026-03-05
>
> **Referenced decisions:** D030 (Workshop registry), D049 (P2P distribution), D050 (cross-project library), D052 (identity/auth), D074 (community server), D076 (standalone crate extraction)
>
> **References:** `research/p2p-distribute-crate-design.md`, `research/p2p-engine-protocol-design.md`, `src/modding/workshop.md`, Workshop Platform Evolution proposal, Kubernetes architecture documentation, Nomad (HashiCorp) architecture, Fly.io Machines API

---

## 0. The Intuition

Kubernetes solves a specific problem: given a pool of machines, distribute work (containers) across them reliably, with health monitoring, automatic recovery, service discovery, configuration management, and access control.

The IC P2P platform — when you strip away the content-distribution vocabulary — solves a structurally similar problem: given a pool of nodes (peers/federation servers), distribute content across them reliably, with health monitoring (EWMA peer scoring), automatic recovery (re-announce, failover sources), discovery (DHT/tracker/mDNS/federation), configuration management (5-tier layered config), and access control (Ed25519 identity, trust tiers, `AuthPolicy` trait).

The gap between "distribute content" and "distribute compute" is:

1. **A content unit that can execute** (container image → OCI image as a `ResourcePackage`)
2. **A scheduler that places work** (piece picker → task scheduler)
3. **A supervisor that monitors execution** (choking algorithm → health checker)
4. **Networking between running tasks** (peer wire protocol → service mesh)

Each of these gaps is smaller than it appears because the platform already has the underlying primitive — it just needs to be repurposed.

---

## 1. Why This is Compelling

### 1.1 Kubernetes' Actual Problem

Kubernetes has won the container orchestration war. It's also widely acknowledged to be:

- **Absurdly complex** for what most people need. Running K8s requires etcd, the API server, the scheduler, the controller manager, kubelet on every node, kube-proxy, a CNI plugin, a CSI plugin, an ingress controller, a service mesh (probably), cert-manager, and a monitoring stack. The minimum viable K8s cluster is ~8 components before you run a single workload.
- **Centralized by assumption.** The control plane (etcd + API server) is a single logical cluster. Federation (KubeFed) was attempted and largely abandoned. Multi-cluster is solved by vendor-specific products (GKE Fleet, EKS Anywhere, Rancher), not by Kubernetes itself.
- **Expensive at rest.** A K8s cluster has a fixed cost regardless of workload — the control plane must run even when no user containers are scheduled. This makes it inappropriate for small deployments, hobbyist infrastructure, and bursty workloads.

The platform opportunity is a system that provides K8s-like orchestration with:
- **Zero fixed cost** — no dedicated control plane; orchestration emerges from peer consensus
- **Federation as default** — every node can participate in multiple "clusters" simultaneously
- **Gradual complexity** — start with one node running one task; add nodes and the system handles distribution automatically
- **P2P content delivery** for images — container images are large (100MB–2GB); P2P distribution means the first pull is slow but every subsequent pull on the same network is fast

### 1.2 The Structural Alignment

| K8s Concept                | IC Platform Primitive                                                   | Gap Size                                                                                                         |
| -------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Container image**        | `ResourcePackage` / `.icpkg`                                            | Small — need OCI image support as a content type                                                                 |
| **Image registry**         | Workshop registry (federated, multi-source)                             | **None** — direct mapping                                                                                        |
| **Image pull**             | P2P download with priority scheduling                                   | **None** — direct mapping, and *better* than K8s (P2P vs. hub-and-spoke)                                         |
| **Node identity**          | Ed25519 `PlayerKey` / publisher identity                                | **None** — direct mapping                                                                                        |
| **Node discovery**         | DHT, tracker, mDNS (LSD), federation                                    | **None** — direct mapping                                                                                        |
| **Node health**            | EWMA peer scoring (capacity, latency, availability, age)                | Small — need to extend from "peer" to "worker node"                                                              |
| **Scheduler**              | Piece picker (priority, rarest-first, preemption)                       | Medium — need to generalize from "which piece to download" to "which task to place where"                        |
| **Service discovery**      | Schema-based capability discovery (§ 3.2 of Platform Evolution)         | Small — need DNS-like name resolution layer                                                                      |
| **ConfigMaps / Secrets**   | Content Channels (mutable streams) + encrypted content                  | Small — need secret management semantics                                                                         |
| **Persistent volumes**     | `StorageBackend` trait                                                  | Medium — need network-attached storage semantics                                                                 |
| **Pod eviction**           | Revocation (tracker de-listing, block list, federation propagation)     | **None** — direct mapping                                                                                        |
| **RBAC**                   | Trust tiers (Unverified → Verified → Trusted → Featured) + `AuthPolicy` | Small — need to extend from "publisher trust" to "operator permissions"                                          |
| **Networking (CNI)**       | P2P transport (TCP, uTP, WebRTC) + BEP 10 extensions                    | Medium — need inter-task networking (overlay / service mesh)                                                     |
| **Rolling updates**        | Content Channels with version progression                               | Small — need orchestrated rollout semantics                                                                      |
| **Resource quotas**        | `RatePolicy` trait, bandwidth scheduling, connection limits             | Small — need CPU/memory quotas alongside bandwidth                                                               |
| **etcd (consensus)**       | CRDTs (from Platform Evolution § 3.3) + threshold trust (§ 5.4)         | Medium — CRDTs provide eventual consistency, not linearizable consensus; some use cases need stronger guarantees |
| **Operators / CRDs**       | `WorkshopClient` trait + extension schema                               | Medium — need a controller pattern for custom resources                                                          |
| **Horizontal autoscaling** | Torrent swarm dynamics (peers join/leave organically)                   | Medium — need metric-driven scale decisions                                                                      |

**Observation:** Of 17 core K8s concepts, 4 are direct mappings (gap = none), 7 are small extensions, and 6 are medium-sized new capabilities. Zero are "start from scratch" — every K8s concept has a platform primitive to build on.

### 1.3 What the P2P Model Does *Better* Than K8s

Several aspects of the platform's architecture aren't just "equivalent" to K8s — they're actively superior for certain workloads:

**Image distribution.** Kubernetes pulls container images from a central registry (Docker Hub, ECR, GCR). Every node pulls independently. A 500MB image deployed to 100 nodes means 50GB of registry egress. With P2P distribution, the first node pulls from the registry; subsequent nodes pull pieces from each other. Total registry egress approaches 500MB regardless of cluster size. This is the same inverted economics that makes BitTorrent work.

Google's internal system, Dragonfly (later open-sourced), and Uber's Kraken solve this exact problem by overlaying P2P on top of K8s image pulls. The platform has P2P as the *default* distribution mechanism — no overlay needed.

**No single point of failure.** K8s clusters die when the control plane dies. If etcd loses quorum, the cluster makes no scheduling decisions. The platform's model — peer consensus, federated state, CRDT-based coordination — means there is no single component whose failure stops the world. Individual nodes failing degrades capacity, not control.

**Zero-cost at rest.** A K8s cluster's control plane consumes resources whether or not any workloads run. A platform-based "cluster" with no tasks has zero overhead — nodes are just peers that haven't been asked to do anything yet.

**Cross-organizational federation.** K8s multi-cluster requires explicit setup and trusts a single operator per cluster. The platform's federation is cross-organizational by design — multiple independent operators run servers that interoperate. This enables scenarios K8s can't: "borrow" compute from a partner organization during peak load, with cryptographic attribution and trust boundaries.

---

## 2. Concrete Architecture Sketch

### 2.1 New Concepts

The platform gains three new concepts, each built on existing primitives:

#### WorkUnit — The Atomic Schedulable Task

A `WorkUnit` is to the compute platform what a `TorrentHandle` is to P2P distribution: the atomic unit of work the system manages.

```rust
/// A schedulable unit of compute. Analogous to a Kubernetes Pod,
/// but lighter — no IP-per-pod, no sidecar injection.
/// Published as a ResourcePackage with category "workunit".
pub struct WorkUnit {
    /// Unique identity (publisher/name@version, reuses ResourcePackage ID)
    pub id: ResourceId,
    
    /// The executable content — an OCI image reference, a WASM module,
    /// or a native binary, distributed as a ResourcePackage via P2P.
    pub image: ImageSpec,
    
    /// Resource requirements (what the task needs to run)
    pub resources: ResourceRequirements,
    
    /// Scheduling constraints (where the task can run)
    pub constraints: SchedulingConstraints,
    
    /// Health check definition (how to know the task is alive)
    pub health: HealthSpec,
    
    /// Restart policy on failure
    pub restart: RestartPolicy,
    
    /// Environment configuration (Content Channel reference for live config)
    pub config: Option<ContentChannelRef>,
    
    /// Network exposure (ports, service name for discovery)
    pub network: NetworkSpec,
}

pub enum ImageSpec {
    /// OCI container image, pulled via P2P from the registry
    Oci {
        registry: String,          // "workshop://publisher/image@version"
        command: Vec<String>,
        env: HashMap<String, String>,
    },
    /// WASM module — lightweight, sandboxed, cross-platform
    Wasm {
        module: ResourceId,        // ResourcePackage containing the .wasm
        runtime: WasmRuntime,      // wasmtime | wasmer
        memory_limit: u64,         // bytes
    },
    /// Native binary (platform-specific ResourcePackage)
    Native {
        package: ResourceId,
        entrypoint: String,
        args: Vec<String>,
    },
}

pub struct ResourceRequirements {
    pub cpu_millicores: u32,       // 1000 = 1 full core
    pub memory_bytes: u64,
    pub storage_bytes: u64,
    pub bandwidth_bytes_sec: u64,  // reuses existing RatePolicy infrastructure
    pub gpu: Option<GpuRequirement>,
}

pub struct SchedulingConstraints {
    /// Node must have these capabilities (schema-based capability matching)
    pub requires: Vec<Capability>,
    
    /// Affinity: prefer co-location with these WorkUnits
    pub affinity: Vec<ResourceId>,
    
    /// Anti-affinity: avoid co-location (for redundancy)
    pub anti_affinity: Vec<ResourceId>,
    
    /// Geographic / network locality preference
    pub locality: Option<LocalityPreference>,
    
    /// Trust tier requirement (minimum trust of the hosting node)
    pub min_trust: TrustTier,
}

pub enum RestartPolicy {
    Always,                        // restart on any exit (long-running services)
    OnFailure { max_retries: u32 }, // restart on non-zero exit
    Never,                         // run once (batch jobs)
}
```

#### WorkerNode — A Peer That Volunteers Compute

A `WorkerNode` is a peer that advertises available compute resources, not just P2P bandwidth. It extends the existing peer concept with resource advertisements.

```rust
/// A peer that volunteers compute capacity.
/// Advertised via the existing discovery mechanisms (DHT, tracker, federation).
pub struct WorkerNode {
    /// Existing peer identity (Ed25519)
    pub identity: PlayerKey,
    
    /// Available resources (updated periodically)
    pub available: ResourceCapacity,
    
    /// Capabilities this node provides (schema-based, queryable via CapabilityQuery)
    pub capabilities: Vec<Capability>,
    
    /// Trust tier (inherited from publisher trust system)
    pub trust_tier: TrustTier,
    
    /// Current load (running WorkUnits and their resource consumption)
    pub load: NodeLoad,
    
    /// Geographic / network locality hints
    pub locality: LocalityInfo,
    
    /// Health score (EWMA-scored, reuses existing 4D peer scoring)
    pub health_score: f64,
}

pub struct ResourceCapacity {
    pub total_cpu_millicores: u32,
    pub available_cpu_millicores: u32,
    pub total_memory_bytes: u64,
    pub available_memory_bytes: u64,
    pub total_storage_bytes: u64,
    pub available_storage_bytes: u64,
    pub bandwidth_up_bytes_sec: u64,
    pub bandwidth_down_bytes_sec: u64,
    pub gpu: Option<GpuInfo>,
}

pub struct NodeLoad {
    pub running_work_units: Vec<RunningWorkUnit>,
    pub cpu_utilization: f32,      // 0.0 – 1.0
    pub memory_utilization: f32,
    pub network_utilization: f32,
}
```

#### ClusterView — Emergent State from Peer Consensus

There is no central control plane. The "cluster" is an emergent view constructed from:

1. **Discovery** — nodes find each other via existing mechanisms (DHT, tracker, mDNS, federation)
2. **Gossip** — nodes exchange state (available resources, running tasks) via CRDT-based gossip
3. **Scheduling** — any node can propose a placement; placement is accepted when the target node confirms

```rust
/// The cluster is not a thing you create — it's a view you observe.
/// Every node that shares a federation context and a ClusterScope
/// sees the same eventual-consistent view of available nodes and running tasks.
pub struct ClusterView {
    /// Cluster identity (a named scope — multiple clusters can coexist)
    pub scope: ClusterScope,
    
    /// Known worker nodes (discovered via DHT/tracker/federation/mDNS)
    pub nodes: HashMap<PlayerKey, WorkerNode>,
    
    /// Running work units and their placements
    pub placements: HashMap<ResourceId, Placement>,
    
    /// Desired state (what should be running)
    pub desired: Vec<WorkUnit>,
    
    /// View freshness (last gossip sync timestamp per node)
    pub freshness: HashMap<PlayerKey, Instant>,
}

pub struct ClusterScope {
    /// A human-readable name for this cluster
    pub name: String,
    
    /// The federation sources that define membership
    /// (reuses existing Workshop source configuration)
    pub sources: Vec<SourceConfig>,
    
    /// Admission policy: which nodes can join this cluster?
    pub admission: AdmissionPolicy,
}

pub enum AdmissionPolicy {
    /// Any node with a valid Ed25519 identity (open mesh)
    Open,
    /// Nodes must be Verified+ trust tier
    TrustGated(TrustTier),
    /// Nodes must present a cluster-specific invitation token
    InviteOnly { issuer: PlayerKey },
    /// Nodes must be members of a specific federation server
    FederationMember { server: String },
}

pub struct Placement {
    pub work_unit: ResourceId,
    pub node: PlayerKey,
    pub started_at: Instant,
    pub health_status: HealthStatus,
    pub resource_usage: ResourceUsage,
}
```

### 2.2 The Scheduling Model

K8s scheduling is centralized: the kube-scheduler examines all pending pods and all available nodes, then makes a globally optimal placement decision. This requires a single consistent view of the cluster (etcd).

The platform's scheduling model is **decentralized and negotiated**. Since there's no central state store, scheduling happens through a protocol:

```
1. PROPOSE — Any node can propose a placement:
   "WorkUnit X should run on Node Y"
   (The proposer is typically the node that received the work request,
   or a designated "scheduler" node for the cluster.)

2. EVALUATE — The target node evaluates:
   - Do I have the resources? (ResourceCapacity check)
   - Do I meet the constraints? (Capability + locality + trust)
   - Am I willing? (Policy check — the node can refuse)

3. ACCEPT/REJECT — The target responds:
   - ACCEPT: pulls the image (P2P!), starts the WorkUnit, gossips the placement
   - REJECT { reason }: proposer tries another node

4. GOSSIP — On accept, the placement is broadcast via CRDT gossip.
   All nodes update their ClusterView.
```

This is reminiscent of Nomad's evaluation/allocation model more than K8s's centralized scheduler, but with an additional P2P negotiation layer.

**Scheduling heuristics reuse the existing peer scoring infrastructure:**

```rust
/// Scheduling score for placing a WorkUnit on a WorkerNode.
/// Reuses the same multi-dimensional scoring pattern as P2P peer scoring.
pub struct SchedulingScore {
    /// Does the node have enough resources? (hard constraint — pass/fail)
    pub fits: bool,
    
    /// Soft scoring dimensions (weighted, same pattern as peer scoring):
    
    /// Resource headroom — prefer nodes with more spare capacity
    /// (avoids hot spots, same principle as rarest-first piece selection)
    pub headroom: f64,
    
    /// Locality match — prefer nodes close to dependencies
    /// (reuses peer latency scoring dimension)
    pub locality: f64,
    
    /// Trust level — prefer higher-trust nodes for sensitive workloads
    /// (direct reuse of trust tier system)
    pub trust: f64,
    
    /// Historical reliability — EWMA of this node's task completion rate
    /// (direct reuse of EWMA peer scoring)
    pub reliability: f64,
    
    /// Affinity/anti-affinity satisfaction
    pub affinity: f64,
}
```

### 2.3 State Management Without etcd

K8s requires etcd for linearizable consensus — the guarantee that all API server reads reflect the latest write. This is essential when two schedulers might try to place a pod on the same node simultaneously.

The platform uses **CRDTs for eventually consistent state** and **negotiation for conflict resolution**. This means:

- **Cluster view is eventually consistent.** Two nodes might briefly disagree about whether a node has spare capacity. This is acceptable for most workloads and is the same consistency model as DNS, BGP, and most large-scale distributed systems.

- **Placement conflicts are resolved by the target node.** If two proposals for the same resources arrive at a node, the node accepts whichever fits and rejects the other. The proposer retries elsewhere. This is analogous to optimistic concurrency control — conflicts are rare and cheap to retry.

- **Strong consistency is available when needed** via a CRDT extension: a `ConflictFreeCounter` tracks resource allocation claims. Concurrent claims that would exceed capacity are detected at merge time and the later-timestamped claim is rejected. This provides the practical guarantees of etcd (no double-booking) without the operational overhead.

For use cases that genuinely require linearizable consensus (leader election, distributed locks), the platform can integrate with an external consensus system (Raft via `openraft` crate, or an optional etcd connection). But the design hypothesis is that 90%+ of orchestration use cases work fine with eventual consistency and negotiation.

### 2.4 Networking Between Tasks

K8s provides per-pod IP addressing via CNI plugins. This is powerful but complex. The platform offers two simpler networking models:

**Model 1: Direct peer connection (default).** Running tasks discover each other via the existing discovery mechanisms. Task A finds Task B via schema-based capability query ("I need a service that provides `http/api/users`"), gets its address, connects directly. This is service discovery without a service mesh — simpler, but limited to environments where tasks can reach each other directly (same LAN, or public internet with NAT traversal).

**Model 2: Relay-mediated.** Tasks that can't connect directly use the existing relay infrastructure (federation servers, P2P relay). The relay mediates connections using the same hole-punching and fallback mechanisms already designed for the P2P engine. This handles NAT, firewalls, and cross-network communication without requiring an overlay network.

```rust
/// Service registration for a running WorkUnit.
/// Announced via DHT/tracker/gossip, queryable via CapabilityQuery.
pub struct ServiceEndpoint {
    pub work_unit: ResourceId,
    pub name: String,                  // "api", "metrics", "grpc"
    pub port: u16,
    pub protocol: ServiceProtocol,     // http | grpc | tcp | udp
    pub capabilities: Vec<Capability>, // schema-based (what does this service provide?)
    pub node: PlayerKey,               // which node is hosting
    pub direct_addr: Option<SocketAddr>,  // if directly reachable
    pub relay_token: Option<String>,      // relay-mediated access token
}
```

---

## 3. Use Cases That Make This Real

### 3.1 The IC-Native Use Case: Decentralized Game Server Hosting

The first consumer would be IC itself. Currently, `ic-server` is a single binary that a community operator runs on their own hardware. The decentralized compute layer enables:

- **Elastic game servers.** Community A runs a popular server but their hardware is overloaded during tournaments. Community B has spare capacity. The platform automatically places overflow game instances on Community B's nodes, with Community A's players connecting transparently. After the tournament, the overflow instances wind down.

- **Relay mesh.** Instead of each community running an independent relay server, relay nodes form a mesh. Players are connected to the nearest relay node. Relays federate game sessions transparently. This improves latency for cross-community play.

- **Self-healing multiplayer.** If a relay node goes down mid-match, the supervision system (built on existing EWMA health scoring) detects the failure and migrates the session to another node — potentially within the same game tick if there's a warm standby.

This is credible because:
1. The `ic-server` binary already bundles relay + matchmaking + ranking (D074)
2. The P2P distribution layer already distributes game content between nodes
3. The federation model already connects community servers
4. The identity and trust systems already authenticate operators

The gap is: scheduling game sessions onto nodes, and migrating sessions on failure.

### 3.2 AI Inference Mesh

Distribute LLM inference across a federated pool of nodes. Each node advertises its GPU capacity. Inference requests are routed to the node with the best fit (model already cached + GPU available + lowest latency).

This maps naturally to the platform because:
- **Model distribution is P2P.** A 30GB model is pulled once and seeded to other nodes — the same economics as game mod distribution.
- **Node selection is scoring-based.** The 4D peer scoring (capacity, latency, availability, reliability) maps directly to inference node selection.
- **Federation enables cross-org GPU sharing.** A research group with spare GPU capacity during off-hours can federate into an inference mesh, with trust tiers controlling who can submit inference requests.

### 3.3 Developer Environments

A team of developers shares compute resources for CI/CD. Each developer's machine is a `WorkerNode` when idle. CI jobs are `WorkUnits` that get placed on the most available machine. Build artifacts (container images, compiled binaries) are distributed P2P — the first build is slow, but subsequent developers who need the same artifact get it from the builder's cache instantly.

This is the "inner CDN" concept from Pants/Buck/Bazel remote caching, but generalized: not just build cache, but the compute that produces it.

### 3.4 Edge Computing / IoT Fleet Management

IoT devices are `WorkerNodes` with constrained resources (`embedded_minimal` profile). A fleet manager publishes firmware updates as `ResourcePackages`. The scheduling system rolls out updates progressively — a canary group first, then wider deployment if health checks pass.

The P2P advantage: devices on the same LAN seed firmware to each other. A factory floor with 100 devices doesn't pull the firmware 100 times from the cloud — the first device seeds to its neighbors via LSD (local service discovery).

---

## 4. Gap Analysis — What Needs Building

### 4.1 Must-Build (No Existing Primitive)

| Capability                       | K8s Equivalent            | Effort | Description                                                                                                                                                                             |
| -------------------------------- | ------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Process supervision**          | kubelet                   | Large  | Run and monitor processes on a node. OCI runtime integration (`youki`, `crun`) for containers, `wasmtime` for WASM, process spawning for native. Health check execution. Restart logic. |
| **Resource metering**            | cAdvisor / metrics-server | Medium | Measure actual CPU, memory, I/O usage per WorkUnit. Report to gossip layer. cgroups v2 on Linux, Job Objects on Windows.                                                                |
| **Inter-task networking**        | CNI + kube-proxy          | Medium | Service endpoint registration + discovery (can extend SchemaDiscovery). Connection relay for tasks behind NAT. Optional: encrypted tunnels between tasks.                               |
| **Placement protocol**           | kube-scheduler            | Medium | The PROPOSE/EVALUATE/ACCEPT protocol. Distributed, negotiated, conflict-resolving.                                                                                                      |
| **Desired state reconciliation** | Controller manager        | Medium | Continuously compare desired WorkUnits with actual placements. Reschedule on node failure. Scale up/down based on metrics.                                                              |

### 4.2 Small Extensions to Existing Primitives

| Capability                         | Extension To                        | Effort | Description                                                                                                         |
| ---------------------------------- | ----------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------- |
| **OCI image as `ResourcePackage`** | Workshop registry + manifest        | Small  | Define `ImageSpec::Oci` content type. OCI layers map to torrent pieces. Registry API wraps `WorkshopClient`.        |
| **Worker resource advertisements** | Peer scoring / tracker announce     | Small  | Extend BEP 10 handshake (`ic_capabilities` bitmask + structured resource announcement).                             |
| **Scheduling score**               | Peer scoring (4D EWMA)              | Small  | Same scoring infrastructure, different dimensions (headroom, locality, trust, reliability, affinity).               |
| **Config as Content Channel**      | Content Channels (§ 3.1)            | Small  | ConfigMap / Secret equivalent: tasks subscribe to a Content Channel for live configuration. Encryption for secrets. |
| **Rolling update**                 | Content Channel version progression | Small  | Orchestrated version rollout: canary → percentage → full, with health-check gates between phases.                   |

### 4.3 Hard Problems to Solve

| Problem                                         | Why It's Hard                                                                                             | K8s Approach                                                 | Platform Approach                                                                                                                                                                        |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Resource accounting across trust boundaries** | Node self-reports its capacity. A malicious node could over-report to attract work, then fail to execute. | K8s trusts its own nodes (within a single trust domain).     | EWMA reliability scoring + trust tiers. Nodes that consistently fail tasks get demoted. Same pattern as banning peers who send corrupt pieces.                                           |
| **State migration**                             | Moving a running task from one node to another requires checkpointing state.                              | CRIU for container checkpoint/restore (experimental in K8s). | Sim snapshot infrastructure (D010). WorkUnits that support migration implement a `Snapshot` trait. Works well for game servers (already snapshottable); harder for arbitrary containers. |
| **Billing / incentives**                        | Why would someone donate compute to the mesh?                                                             | K8s doesn't solve this (within one org).                     | `IncentiveAccounting` trait (Workshop Platform Evolution § 8). Federated auctions for capacity. "Contribute compute, earn credits for compute elsewhere."                                |
| **Multi-tenancy isolation**                     | WorkUnits from different publishers run on the same node.                                                 | Namespaces, network policies, PodSecurityPolicy.             | WASM sandboxing (strongest: memory-safe, no filesystem). OCI containers with cgroups (standard). Trust-tier-based admission (only run Trusted publishers' WorkUnits).                    |
| **Consensus for critical state**                | Some decisions (leader election, distributed locks) require stronger-than-eventual consistency.           | etcd (Raft consensus).                                       | Deferred: integrate `openraft` for use cases that need it. Hypothesis: most orchestration works with CRDT + negotiation. Validate empirically.                                           |

---

## 5. Comparison to Existing Decentralized Compute Platforms

| Platform              | Model                                  | Strengths                                         | Weaknesses                                                         | IC Platform Advantage                                                    |
| --------------------- | -------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| **Kubernetes**        | Centralized control plane, single-org  | Mature, ecosystem, all features                   | Complex, expensive at rest, no federation                          | Zero control plane, P2P image distribution, federation-native            |
| **Nomad (HashiCorp)** | Single binary, lighter than K8s        | Simple, multi-runtime (containers + VMs + native) | Still centralized servers, single-org                              | Decentralized scheduling, cross-org federation                           |
| **Akash Network**     | Blockchain-based decentralized compute | Truly decentralized, marketplace for compute      | Blockchain overhead, slow, expensive transactions, Web3 dependency | No blockchain, pure P2P, CRDT state, lower latency                       |
| **Golem Network**     | Decentralized compute marketplace      | Arbitrary compute tasks, payment network          | Complex setup, small network, Web3 token required                  | No token/blockchain, existing peer network from game distribution        |
| **Bacalhau**          | Decentralized compute over IPFS        | Compute-over-data, good for batch                 | Limited to data-adjacent compute, IPFS dependency                  | Multi-transport (not IPFS-locked), interactive workloads                 |
| **Fly.io**            | Centralized but edge-distributed       | Low latency, great DX, Machines API               | Vendor-locked, single company controls infrastructure              | Open-source, self-hostable, federated                                    |
| **Holochain**         | Agent-centric DHT                      | Truly P2P, no consensus bottleneck                | Niche ecosystem, custom everything                                 | Reuses battle-tested BT protocol, existing ecosystem from game community |

**Key differentiator:** Every existing decentralized compute platform either (a) depends on blockchain/tokens, (b) requires a centralized control plane, or (c) has a tiny network. The IC platform would have none of these limitations: no blockchain, no control plane, and a growing peer network from game content distribution that provides the bootstrap population.

---

## 6. The Bootstrap Problem and the Trojan Horse

The hardest problem for any decentralized compute platform is bootstrap: you need tasks to attract nodes, and nodes to run tasks. Akash, Golem, and other decentralized compute platforms have struggled with this chicken-and-egg.

The IC platform has a unique answer: **the game community IS the bootstrap.**

```
Phase 1: IC Workshop distributes game content (mods, maps, replays).
         → Thousands of peers running the P2P engine.
         
Phase 2: ic-server nodes provide game servers + relay + matchmaking.
         → Hundreds of community-operated federated servers.
         
Phase 3: ic-server nodes start hosting game instances for other communities.
         → Decentralized game server orchestration (§ 3.1).
         → The first "WorkUnits" are game servers — a workload the community
            already runs and understands.
            
Phase 4: The compute layer generalizes beyond game servers.
         → AI inference, CI/CD, edge computing.
         → The peer network, federation, identity, and trust are already mature
            from 3 phases of game-community use.
```

This is the moat. No other decentralized compute platform has a natural, intrinsically-motivated user base that's already running the infrastructure for a different (socially engaging) purpose. The game community runs P2P nodes because they want to play games, not because they're speculating on compute tokens. The compute platform piggybacks on infrastructure that exists for independent reasons.

---

## 7. Standalone Crate Strategy (D076 Alignment)

Following the D076 standalone crate extraction strategy, the decentralized compute layer would be structured as:

```
p2p-distribute          (Tier 3, Phase 5-6a)  — Already planned. P2P content delivery.
p2p-orchestrate         (Tier 4+, post-IC)    — NEW. Scheduling, supervision, state mgmt.
p2p-orchestrate-oci     (Feature crate)       — OCI container runtime integration.
p2p-orchestrate-wasm    (Feature crate)       — WASM workload runtime.
p2p-orchestrate-native  (Feature crate)       — Native binary supervision.
```

`p2p-orchestrate` depends on `p2p-distribute` (for content delivery) but not on any IC crate. Licensed MIT OR Apache-2.0 per D076 conventions. The IC game uses it for decentralized game server hosting; the crate is independently useful for any P2P compute workload.

---

## 8. Risk Assessment

| Risk                                                                           | Severity | Mitigation                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Scope creep.** This is a massive R&D surface that could consume the project. | High     | This is exploration only. No commitment until IC Phases 0–5 are delivered. The compute layer is Phase 7+ at earliest.                                                                                                                                             |
| **"Not our core competency."** IC is a game engine, not a cloud platform.      | Medium   | The game server hosting use case (§ 3.1) is directly on-mission. Everything else is upside.                                                                                                                                                                       |
| **Security of running untrusted code.**                                        | High     | WASM-first for untrusted workloads (memory-safe sandbox). OCI only for trusted publishers. Trust tiers control what runs where.                                                                                                                                   |
| **Performance of decentralized scheduling.**                                   | Medium   | Validate empirically. The negotiation protocol adds latency vs. centralized scheduling. For game servers (placement decisions are rare, execution is long), this latency is irrelevant. For serverless-style workloads (many short tasks), it may be prohibitive. |
| **Incentive misalignment.**                                                    | Medium   | The `IncentiveAccounting` trait is pluggable — different communities can use different incentive models (reciprocity, credits, economic). No single incentive model is baked in.                                                                                  |

---

## 9. Relationship to Workshop Platform Evolution

The Workshop Platform Evolution proposal (§ 2.1) lists "Plugin ecosystems," "Enterprise artifacts," and "Indie game stores" as market applications. Decentralized compute is an *infrastructure layer* that enables several of those applications:

- A plugin ecosystem with a compute layer can run plugins as services (Language Server Protocol servers, linters, formatters — distributed across a CI mesh)
- Enterprise artifact distribution with a compute layer becomes a self-hosted CI/CD platform
- An indie game store with a compute layer becomes a decentralized game hosting platform (the § 3.1 use case)

The compute layer is not a separate product — it's the next logical capability in the same platform trajectory. Content distribution → content + compute distribution → full application platform.

---

## 10. Next Steps (If This Direction Is Pursued)

1. **Validate the scheduling model.** Build a prototype of the PROPOSE/EVALUATE/ACCEPT protocol using `p2p-distribute` as transport. Measure scheduling latency and conflict rates under realistic conditions (10–100 nodes, 50–1000 tasks).

2. **Validate CRDT state management.** Implement `ClusterView` as a CRDT document. Measure convergence time, state size, and correctness under network partitions.

3. **IC game server orchestration PoC.** Take the existing `ic-server` binary and wrap it as a `WorkUnit`. Demonstrate cross-community game server placement and failure recovery. This validates the concept with a real workload the community cares about.

4. **Benchmark P2P image distribution.** Measure OCI image pull latency via P2P vs. traditional registry pull, for realistic image sizes (100MB–2GB) and cluster sizes (10–100 nodes). The hypothesis: P2P is slower for the first pull but dramatically faster at scale.

5. **Survey the community.** Is decentralized game server hosting something community operators actually want? The technical possibility is clear; the demand signal needs validation.

---

## 11. Conclusions

The intuition is sound. The IC P2P platform's primitives — federated registry, P2P distribution, Ed25519 identity, EWMA scoring, Content Channels, CRDTs, schema-based discovery, trust tiers, transport abstraction — map to Kubernetes' core concepts with surprisingly small gaps. The remaining work is real but bounded: process supervision, resource metering, inter-task networking, placement protocol, and desired-state reconciliation.

The strategic advantage is the bootstrap: no other decentralized compute platform has a natural user base that's already running the infrastructure. The game community provides the peer network, the federation topology, the identity graph, and the trust hierarchy. The compute layer rides on top.

This doesn't need to be built now — or even committed to. It's an R&D option that increases in value as the platform matures through IC Phases 0–5. The exploration cost is near zero. The option value is high.

**The one commitment this exploration does support:** design `p2p-distribute` and the federation layer with compute-readiness in mind. The extensibility traits (`AuthPolicy`, `StorageBackend`, `DiscoveryBackend`, etc.) are already correct. The additional trait surface — `WorkUnit`, `WorkerNode`, `SchedulingScore` — should be sketched during Phase 4–5 design to ensure the public API of `p2p-distribute` doesn't accidentally preclude compute orchestration.
