## Type-Safety Architectural Invariants

The type system is the first line of defense against logic bugs. These rules are non-negotiable and enforced via `clippy::disallowed_types`, custom lints, and code review.

### Newtype Policy: No Bare Integer IDs

Every domain identifier uses a newtype wrapper. Bare `u32`, `u64`, or `usize` values must never be used as entity IDs, player IDs, slot indices, or any other domain concept.

```rust
// CORRECT — newtypes prevent ID confusion at compile time
pub struct PlayerId(u32);
pub struct SlotIndex(u8);
pub struct AccountId(u64);
pub struct UnitId(Entity);     // wraps Bevy Entity
pub struct BuildingId(Entity);
pub struct ProjectileId(Entity);
pub struct SimTick(u64);

// WRONG — bare integers allow passing a PlayerId where a SlotIndex is expected
fn apply_order(player: u32, slot: u32, tick: u64) { ... }
```

**Extended newtypes** — the same policy applies to every domain identifier across all crates:

```rust
// Simulation timing — NEVER confuse SubTickTimestamp with SimTick.
// SimTick counts whole ticks. SubTickTimestamp is a microsecond offset
// within a single tick window, used for sub-tick order fairness (D008).
pub struct SubTickTimestamp(u32);

// Campaign system (D021)
pub struct MissionId(u32);
pub struct OutcomeName(CompactString);  // validated: ASCII alphanumeric + underscore only

// Balance / AI / UI systems
pub struct PresetId(u32);       // balance preset (D019)
pub struct ThemeId(u32);        // UI theme (D032)
pub struct PersonalityId(u32);  // AI personality (D043)

// Workshop / packaging (D030)
pub struct PublisherId(u64);
pub struct PackageName(CompactString);  // validated: [a-z0-9-], 3-64 chars
pub struct PackageVersion(u32, u32, u32);  // Major.Minor.Patch — no string parsing at runtime

// WASM sandbox
pub struct WasmInstanceId(u32);

// Cryptographic identity — private field prevents construction with wrong hash
pub struct Fingerprint([u8; 32]);
```

**`Fingerprint` is constructible only via its compute function:**

```rust
impl Fingerprint {
    /// Compute fingerprint from canonical byte representation.
    /// This is the ONLY way to create a Fingerprint.
    pub fn compute(data: &[u8]) -> Self {
        Self(sha256(data))
    }
    pub fn as_bytes(&self) -> &[u8; 32] { &self.0 }
}
```

**`VersionConstraint` must be a parsed enum, not a string:**

```rust
// CORRECT — parsed at ingestion; invalid syntax is a type error thereafter
pub enum VersionConstraint {
    Exact(PackageVersion),
    Compatible(PackageVersion),            // ^1.2.3 = >=1.2.3, <2.0.0
    Range { min: PackageVersion, max: PackageVersion },
    GreaterOrEqual(PackageVersion),
}

// WRONG — string re-parsed everywhere; can silently contain invalid syntax
pub type VersionConstraint = String;
```

**Rationale:** The audit identified `PlayerId` ↔ `SlotIndex` ↔ `AccountId` confusion as a critical bug class. A function accepting `(u32, u32, u64)` has no compile-time protection against argument swaps. Newtypes make this a type error. The extended set applies the same principle to timing (sub-tick vs tick), identity (fingerprints), content (versions, packages), and campaign structure (missions, outcomes).

**Enforcement:** `clippy::disallowed_types` bans `u32` and `u64` in function signatures within `ic-sim` (exceptions via `#[allow]` with justification comment). See `16-CODING-STANDARDS.md` § "Type-Safety Coding Standards" for the full clippy configuration and code review checklists covering all newtypes listed here.

### Fixed-Point Math Policy: No f32/f64 in ic-sim

This is the project's most fundamental type-safety invariant (Invariant #1). All game logic in `ic-sim` uses fixed-point math (`i32`/`i64` with known scale). IEEE 754 floats are banned from the simulation because they produce platform-dependent results (x87 vs SSE, FMA contraction, different rounding modes), making deterministic cross-platform replay impossible.

```rust
// CORRECT — fixed-point with known scale (e.g., 1024 = 1.0)
pub struct FixedPoint(i32);

// WRONG — float non-determinism breaks cross-platform replay
fn move_unit(pos: &mut f32, speed: f32) { *pos += speed; }
```

**Scope:** `f32` and `f64` are banned in `ic-sim` only. They are permitted in:
- `ic-game` / `ic-audio` — rendering, interpolation, audio volume (presentation-only)
- `ic-ui` — UI layout, display values, diagnostic overlays
- Server-side infrastructure — matchmaking ratings, telemetry aggregation

**Enforcement:** `clippy::disallowed_types` bans `f32` and `f64` in the `ic-sim` crate. CI blocks on violations. Exceptions require `#[allow]` with a justification comment explaining why the float does not affect determinism.

**Rationale:** The Source SDK 2013 study (`research/source-sdk-2013-source-study.md`) documents Source Engine's runtime `IS_NAN()` checks and bit-level float comparison (`NetworkParanoidUnequal`) as evidence that float-based determinism is fundamentally unreliable. IC eliminates this class of bug entirely.

### Deterministic Collection Policy: No HashSet/HashMap in ic-sim

`std::collections::HashSet` and `std::collections::HashMap` use randomized hashing (`RandomState`). Iteration order varies between runs, breaking determinism (Invariant #1).

```rust
// CORRECT — deterministic alternatives
use std::collections::BTreeSet;
use std::collections::BTreeMap;
use indexmap::IndexMap;  // insertion-order deterministic

// WRONG — non-deterministic iteration order
use std::collections::HashSet;
use std::collections::HashMap;
```

**Exceptions:**
- `ic-game` (render-side) may use `HashMap`/`HashSet` where iteration order doesn't affect sim state
- `ic-net` may use `HashMap` for connection lookup tables (not replicated to sim)
- `ic-sim` may use `HashSet`/`HashMap` **only** for membership tests where the set is never iterated (requires `#[allow]` with justification)

**Enforcement:** `clippy::disallowed_types` in `ic-sim` crate's `clippy.toml`. CI blocks on violations.

### Typestate Policy: State Machines Use Types, Not Enums

Any system with distinct states and restricted transitions must use the typestate pattern. Runtime enum matching for state transitions is a bug waiting to happen.

```rust
// CORRECT — typestate enforces valid transitions at compile time
pub struct Connection<S: ConnectionState> {
    inner: ConnectionInner,
    _state: PhantomData<S>,
}

pub struct Disconnected;
pub struct Handshaking;
pub struct Authenticated;
pub struct InGame;

impl Connection<Disconnected> {
    pub fn begin_handshake(self) -> Connection<Handshaking> { ... }
}
impl Connection<Handshaking> {
    pub fn authenticate(self, cred: &Credential) -> Result<Connection<Authenticated>, AuthError> { ... }
}
impl Connection<Authenticated> {
    pub fn join_game(self, lobby: LobbyId) -> Connection<InGame> { ... }
}

// WRONG — runtime enum allows invalid transitions
pub enum ConnectionState { Disconnected, Handshaking, Authenticated, InGame }
impl Connection {
    pub fn transition(&mut self, to: ConnectionState) { self.state = to; } // any transition allowed!
}
```

**Applies to:** Connection lifecycle, lobby state machine, game phase transitions, install wizard steps, Workshop package lifecycle, mod loading pipeline, and the following subsystem-specific lifecycles:

**WASM Instance Lifecycle (D005):**

```rust
pub struct WasmLoading;
pub struct WasmReady;
pub struct WasmExecuting;
pub struct WasmTerminated;

pub struct WasmSandbox<S> {
    instance_id: WasmInstanceId,
    inner: WasmInstanceInner,
    _state: PhantomData<S>,
}

impl WasmSandbox<WasmLoading> {
    pub fn initialize(self) -> Result<WasmSandbox<WasmReady>, WasmLoadError> { ... }
}
impl WasmSandbox<WasmReady> {
    pub fn execute(self, entry: &str) -> WasmSandbox<WasmExecuting> { ... }
}
impl WasmSandbox<WasmExecuting> {
    pub fn complete(self) -> WasmSandbox<WasmTerminated> { ... }
}
// Cannot call execute() on WasmTerminated — it's a compile error.
```

**Workshop Package Install Lifecycle (D030):**

```rust
pub struct PkgQueued;
pub struct PkgDownloading;
pub struct PkgVerifying;
pub struct PkgExtracted;

pub struct PackageInstall<S> {
    manifest: PackageManifest,
    _state: PhantomData<S>,
}

impl PackageInstall<PkgDownloading> {
    pub fn verify(self) -> Result<PackageInstall<PkgVerifying>, IntegrityError> { ... }
}
impl PackageInstall<PkgVerifying> {
    pub fn extract(self) -> Result<PackageInstall<PkgExtracted>, ExtractionError> { ... }
}
// Cannot call extract() on PkgDownloading — hash must be verified first.
```

**Campaign Mission Execution (D021):**

```rust
pub struct MissionLoading;
pub struct MissionActive;
pub struct MissionCompleted;
pub struct MissionTransitioned;

pub struct MissionExecution<S> {
    mission_id: MissionId,
    _state: PhantomData<S>,
}

impl MissionExecution<MissionActive> {
    pub fn complete(self, outcome: OutcomeName) -> MissionExecution<MissionCompleted> { ... }
}
impl MissionExecution<MissionCompleted> {
    pub fn transition(self) -> MissionExecution<MissionTransitioned> { ... }
}
// Cannot complete a mission that is still loading.
```

**Balance Patch Application (D019):**

```rust
pub struct PatchPending;
pub struct PatchValidated;
pub struct PatchApplied;

pub struct BalancePatch<S> {
    preset_id: PresetId,
    _state: PhantomData<S>,
}

impl BalancePatch<PatchPending> {
    pub fn validate(self) -> Result<BalancePatch<PatchValidated>, PresetError> { ... }
}
impl BalancePatch<PatchValidated> {
    pub fn apply(self) -> BalancePatch<PatchApplied> { ... }
}
// Cannot apply an unvalidated patch.
```

### Capability Token Policy: Mod Sandbox Uses Unforgeable Tokens

WASM and Lua mods access engine APIs through capability tokens — unforgeable proof-of-authorization values that the host creates and the mod cannot construct.

```rust
/// Capability token for filesystem read access. Only the host can create this.
pub struct FsReadCapability {
    allowed_path: StrictPath<PathBoundary>,
    _private: (),  // prevents construction outside this module
}

/// Mod API: read a file (requires capability token)
pub fn read_file(cap: &FsReadCapability, relative: &str) -> Result<Vec<u8>, SandboxError> {
    let full = cap.allowed_path.join(relative)?; // strict-path enforces boundary
    std::fs::read(full.as_ref()).map_err(SandboxError::Io)
}
```

**Rationale:** Without capability tokens, a compromised or malicious mod can call any host function. With tokens, the host controls exactly what each mod can access. Token types are zero-sized at runtime — no overhead.

### Direction-Branded Messages: Network Message Origin

Messages from the client and messages from the server must be distinct types, even if they carry the same payload. This prevents a client-originated message from being mistaken for a server-authoritative message.

```rust
pub struct FromClient<T>(pub T);
pub struct FromServer<T>(pub T);

// Server code accepts only FromClient messages
fn handle_order(msg: FromClient<PlayerOrder>) { ... }

// Client code accepts only FromServer messages
fn handle_state_update(msg: FromServer<SimSnapshot>) { ... }
```

### Bounded Collections: No Unbounded Growth in Sim State

Any collection in `ic-sim` that grows based on player input must have a compile-time or construction-time bound. Unbounded collections are a denial-of-service vector.

```rust
pub struct BoundedVec<T, const N: usize> {
    inner: Vec<T>,
}

impl<T, const N: usize> BoundedVec<T, N> {
    pub fn push(&mut self, item: T) -> Result<(), CapacityExceeded> {
        if self.inner.len() >= N {
            return Err(CapacityExceeded);
        }
        self.inner.push(item);
        Ok(())
    }
}
```

**Applies to:** Order queues, chat message buffers, marker lists, waypoint sequences, build queues, group assignments.

### Hash Type Distinction: SyncHash vs StateHash

The netcode uses two different hash widths for different purposes. Using the wrong one silently produces incorrect verification results.

```rust
/// Fast sync hash: 64-bit truncation for per-tick live comparison.
/// Used in the desync detection hot path (every sync frame).
pub struct SyncHash(u64);

/// Full state hash: SHA-256 for replay signing, snapshot verification,
/// and Merkle tree leaves. Used in cold paths (save, replay, debug).
pub struct StateHash([u8; 32]);
```

**Rationale:** The netcode defines a "fast sync hash" (`u64`) for per-tick RNG comparison and a "full SHA-256" for Merkle tree leaves and replay signing (see `03-NETCODE.md`). A bare `u64` where `[u8; 32]` was expected (or vice versa) silently produces incorrect verification. Distinct types prevent confusion.

**Enforcement:** No implicit conversion between `SyncHash` and `StateHash`. Truncation or expansion requires an explicit, named function.

### Verified Wrapper Policy: Post-Verification Data

Many security bugs stem from processing data that was "supposed to" have been verified but was not. The `Verified<T>` wrapper makes verification status visible in the type system.

```rust
/// Wrapper that proves data has passed a specific verification step.
/// Cannot be constructed without going through the verification function.
pub struct Verified<T> {
    inner: T,
    _private: (),
}

impl<T> Verified<T> {
    /// Only verification functions should call this.
    pub(crate) fn new_verified(inner: T) -> Self {
        Self { inner, _private: () }
    }
    pub fn inner(&self) -> &T { &self.inner }
    pub fn into_inner(self) -> T { self.inner }
}
```

**Applies to:**
- `Verified<SignedCredentialRecord>` — an SCR whose Ed25519 signature has been checked (D052)
- `Verified<ManifestHash>` — a Workshop manifest whose content hash matches the declared hash (D030)
- `Verified<ReplaySignature>` — a replay whose signature chain has been validated
- `ValidatedOrder` (type alias for `Verified<PlayerOrder>`) — an order that passed all validation checks (D012)

**Rationale:** A function accepting `Verified<SignedCredentialRecord>` cannot receive an unverified SCR without a compile error. The `new_verified` constructor is `pub(crate)` to prevent external construction — only the actual verification function in the same crate can wrap a value.

**Enforcement:** Functions in `ic-sim` that consume verified data must accept `Verified<T>`, not bare `T`. Code review must check that `new_verified()` is called only inside actual verification logic (see `16-CODING-STANDARDS.md` § "Verified Wrapper Review").

### Bounded Cvar Policy: Console Variables with Type-Enforced Ranges

The console variable system (D058) allows runtime configuration within defined ranges. Without type enforcement, any code path that sets a cvar can bypass the range check.

```rust
/// A console variable with compile-time or construction-time bounds.
/// Setting a value outside bounds clamps to the nearest bound.
pub struct BoundedCvar<T: Ord + Copy> {
    value: T,
    min: T,
    max: T,
    _private: (),
}

impl<T: Ord + Copy> BoundedCvar<T> {
    pub fn new(default: T, min: T, max: T) -> Self {
        let clamped = default.max(min).min(max);
        Self { value: clamped, min, max, _private: () }
    }
    pub fn set(&mut self, value: T) {
        self.value = value.max(self.min).min(self.max);
    }
    pub fn get(&self) -> T { self.value }
}
```

**Rationale:** `BoundedCvar` makes out-of-range values unrepresentable after construction. All cvars with documented valid ranges (e.g., `net.simulate_latency` 0–500ms, `net.desync_debug_level` 0–2) must use this type.

### Chat Message Scope Branding

In RTS games, team chat vs all-chat is security-critical. A team message accidentally broadcast to all players leaks strategic information.

```rust
/// Chat scope marker types (zero-sized).
pub struct TeamScope;
pub struct AllScope;
pub struct WhisperScope;

/// A chat message branded with its delivery scope.
pub struct ChatMessage<S> {
    pub sender: PlayerId,
    pub text: SanitizedString,
    _scope: PhantomData<S>,
}

// Team chat handler accepts ONLY team messages
fn handle_team_chat(msg: ChatMessage<TeamScope>) { ... }

// All-chat handler accepts ONLY all-chat messages
fn handle_all_chat(msg: ChatMessage<AllScope>) { ... }
```

**Rationale:** Branding the message type with its scope makes routing errors a compile-time type mismatch. Conversion between scopes requires an explicit, auditable function call. This extends the direction-branded messages pattern (see `FromClient<T>` / `FromServer<T>` above) to chat delivery scope.

### Validated Construction Policy: Invariant-Checked Types

Some types have invariants that cannot be encoded in const generics but must hold for correctness. The "validated construction" pattern puts the check at the only place values are created, making invalid instances unconstructible.

```rust
/// A campaign graph that has been validated as a DAG at construction time.
/// Cannot be constructed without passing validation.
pub struct CampaignGraph {
    missions: BTreeMap<MissionId, MissionDef>,
    edges: Vec<(MissionId, OutcomeName, MissionId)>,
    _private: (),  // prevents construction outside this module
}

impl CampaignGraph {
    /// Validate and construct. Returns error if graph contains cycles,
    /// unreachable missions, or dangling outcome references.
    pub fn new(
        missions: BTreeMap<MissionId, MissionDef>,
        edges: Vec<(MissionId, OutcomeName, MissionId)>,
    ) -> Result<Self, CampaignGraphError> {
        Self::validate_dag(&missions, &edges)?;
        Self::validate_reachability(&missions, &edges)?;
        Self::validate_references(&missions, &edges)?;
        Ok(Self { missions, edges, _private: () })
    }
}
```

```rust
/// An order budget with valid invariants (tokens <= burst_cap, refill > 0).
pub struct OrderBudget {
    tokens: u32,
    refill_per_tick: u32,
    burst_cap: u32,
    _private: (),
}

impl OrderBudget {
    pub fn new(refill_per_tick: u32, burst_cap: u32) -> Result<Self, InvalidBudget> {
        if refill_per_tick == 0 || burst_cap == 0 {
            return Err(InvalidBudget);
        }
        Ok(Self { tokens: burst_cap, refill_per_tick, burst_cap, _private: () })
    }

    pub fn try_spend(&mut self) -> Result<(), BudgetExhausted> {
        if self.tokens == 0 { return Err(BudgetExhausted); }
        self.tokens -= 1;
        Ok(())
    }

    pub fn refill(&mut self) {
        self.tokens = (self.tokens + self.refill_per_tick).min(self.burst_cap);
    }
}
```

**Rationale:** `CampaignGraph` guarantees DAG structure, full reachability, and valid references at construction time — no downstream code needs to re-validate. `OrderBudget` guarantees `tokens <= burst_cap` and `refill > 0` — the rate limiter cannot be constructed in a broken state.

**Applies to:** `CampaignGraph`, `OrderBudget`, `BalancePreset` (no circular inheritance), `WeatherSchedule` (non-empty cycle list, valid intensity ranges), `DependencyGraph` (no cycles, all references resolve).
