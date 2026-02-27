# Dependency Resolution Design — PubGrub Algorithm for IC Workshop

> **Purpose:** Algorithm choice, version range semantics, lock file format, diamond dependency handling, error reporting, and integration with IC Workshop's package registry.

- **Date:** 2026-02-26
- **Referenced by:** D030, D049

---

## 1. Algorithm Choice: PubGrub

IC Workshop's dependency resolver uses the **PubGrub** algorithm — the same algorithm backing Cargo's resolver (v2/v3) and uv (Python). PubGrub is a version-solving algorithm designed specifically for package managers. It operates by iteratively building a partial solution and, on conflict, deriving human-readable incompatibilities that explain *why* the conflict exists.

### Why PubGrub

1. **Deterministic:** Same registry state + same root dependencies = identical resolution output, every time, on every platform.
2. **Minimal conflict explanations:** When resolution fails, PubGrub produces a derivation tree of incompatibilities — not a raw UNSAT core. IC can format these into actionable error messages that tell modders exactly which packages conflict and what version ranges are incompatible.
3. **Efficient backtracking:** PubGrub uses conflict-driven clause learning (CDCL), avoiding redundant exploration of known-bad version combinations.
4. **Proven at scale:** Cargo serves the Rust ecosystem (~150k crates). IC Workshop will be orders of magnitude smaller.

### Why Not Other Algorithms

| Algorithm | How it works | Why IC rejects it |
|---|---|---|
| **SAT Solver** (e.g., libsolv/Zypper, older pip) | Encodes all version constraints as boolean satisfiability clauses, runs DPLL/CDCL | Error messages are UNSAT cores — opaque to non-experts. Encoding overhead is unnecessary for Workshop-scale registries. Debugging resolution failures requires expertise in SAT semantics. |
| **MVS (Go-style Minimal Version Selection)** | Always picks the minimum version satisfying all constraints | Always selects oldest compatible version — surprising for users who expect latest compatible. Cannot express exclusion ranges (e.g., "any 1.x except 1.3.0 which is buggy"). Forces ecosystem to always bump minimums manually. |
| **"Newest Wins" greedy** | Pick newest version of each package, hope for the best | Breaks immediately on diamond dependencies with conflicting transitive requirements. No backtracking means no recovery from conflicts. Nondeterministic in edge cases. |
| **Backtracking without learning** | Try combinations, backtrack on conflict | Exponential worst case — no clause learning means re-exploring failed combinations. Slow on deep dependency graphs. |

### Rust Implementation

IC uses the [`pubgrub`](https://github.com/pubgrub-rs/pubgrub) crate (MIT licensed, actively maintained). This crate provides:

- The core `resolve` function
- The `DependencyProvider` trait that IC implements
- `DerivationTree` for error reporting
- `Range<V>` for version range algebra

```toml
# Cargo.toml (ic-workshop crate)
[dependencies]
pubgrub = "0.3"       # version-solving engine
semver = "1"           # semver parsing + comparison
```

---

## 2. Version Range Semantics

IC follows Cargo's semver range conventions exactly. This is a deliberate choice — the C&C modding community overlaps significantly with the Rust/gamedev community, and Cargo's semantics are well-documented and battle-tested.

### Range Operators

| Syntax | Name | Expands to | Example |
|---|---|---|---|
| `^1.2.3` | Caret (compatible) | `>=1.2.3, <2.0.0` | `^1.2.3` matches `1.2.3`, `1.9.99`, not `2.0.0` |
| `^0.2.3` | Caret (0.x special) | `>=0.2.3, <0.3.0` | Minor is treated as breaking when major=0 |
| `^0.0.3` | Caret (0.0.x special) | `>=0.0.3, <0.0.4` | Patch is treated as breaking when major=0, minor=0 |
| `~1.2.3` | Tilde (patch only) | `>=1.2.3, <1.3.0` | `~1.2.3` matches `1.2.3`, `1.2.99`, not `1.3.0` |
| `~1.2` | Tilde (minor only) | `>=1.2.0, <1.3.0` | Same as `~1.2.0` |
| `>=1.0, <2.0` | Explicit range | Literal | Intersection of both bounds |
| `=1.2.3` | Exact pin | `>=1.2.3, <1.2.4` | Only `1.2.3` matches |
| `*` | Wildcard | `>=0.0.0` | Any version (use sparingly) |
| `>=1.0` | Lower bound | `>=1.0.0` | Open-ended (dangerous for forward compat) |
| `<2.0` | Upper bound | `<2.0.0` | Anything below 2.0.0 |

### Pre-release Ordering

Pre-release versions sort *before* their release counterpart. Ordering follows semver spec section 11:

```
1.0.0-alpha.1 < 1.0.0-alpha.2 < 1.0.0-beta.1 < 1.0.0-beta.2 < 1.0.0-rc.1 < 1.0.0
```

Pre-release versions are **never** matched by normal ranges unless explicitly opted in:

- `^1.0` does NOT match `1.1.0-beta.1`
- `^1.1.0-beta.1` DOES match `1.1.0-beta.1`, `1.1.0-beta.2`, `1.1.0`, `1.2.0`, etc.
- `>=1.0.0-alpha.1, <1.0.0` matches only pre-releases of 1.0.0

This prevents modders from accidentally pulling unstable pre-release versions.

### Compatibility Rules

| Bump type | What changed | Example | Meaning |
|---|---|---|---|
| **Major** (X.0.0) | Breaking API/behavior change | `1.0.0` -> `2.0.0` | Removed assets, renamed YAML keys, changed behavior |
| **Minor** (0.X.0) | New features, backward-compatible | `1.0.0` -> `1.1.0` | Added new sprites, new map variants, new config options |
| **Patch** (0.0.X) | Bug fixes only | `1.0.0` -> `1.0.1` | Fixed corrupted texture, corrected balance typo |

### Version Parsing

```rust
use semver::{Version, VersionReq};

/// Parse a version string. Rejects non-semver strings.
fn parse_version(s: &str) -> Result<Version, VersionParseError> {
    s.parse::<Version>().map_err(|e| VersionParseError {
        input: s.to_string(),
        reason: e.to_string(),
    })
}

/// Parse a version requirement string (range expression).
fn parse_version_req(s: &str) -> Result<VersionReq, VersionReqParseError> {
    s.parse::<VersionReq>().map_err(|e| VersionReqParseError {
        input: s.to_string(),
        reason: e.to_string(),
    })
}
```

### Version Regex (for validation at publish time)

```
^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-((0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(\.(0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(\+([0-9a-zA-Z-]+(\.[0-9a-zA-Z-]+)*))?$
```

Build metadata (the `+xyz` suffix) is stored but **ignored** for version comparison and resolution.

---

## 3. Package Manifest (`ic-mod.yaml` Dependency Section)

The Workshop uses `ic-mod.yaml` (also accepts `mod.yaml` for backward compatibility with D030 examples) as the package manifest. The dependency section declares what a package needs.

### Full Annotated Example

```yaml
# ic-mod.yaml — full example for a total conversion mod
mod:
  # Identity (matches Workshop registry: publisher/name@version)
  publisher: "steel-legion"
  name: "desert-storm-tc"
  version: "1.4.0"
  channel: release                    # dev | beta | release

  # Metadata
  display_name: "Desert Storm — Total Conversion"
  description: "Cold War gone hot in North Africa."
  category: full-mod
  license: "CC-BY-SA-4.0"
  ai_usage: deny                      # allow | deny | ask
  repository: "https://github.com/steel-legion/desert-storm-tc"

  # Engine compatibility
  ic_version: "^0.3"                  # required IC engine version

# Required dependencies — must be present for the mod to load
dependencies:
  community-project/hd-infantry-sprites:
    version: "^2.0"
    source: workshop                  # workshop | local | git | url
  alice/soviet-march-music:
    version: ">=1.0, <3.0"
    source: workshop
  bob/desert-terrain-textures:
    version: "~1.4"
    source: workshop

# Optional dependencies — mod works without them, enables extra features if present
optional-dependencies:
  carol/hd-explosion-effects:
    version: "^1.0"
    source: workshop
    feature: "hd-effects"             # feature flag this enables
  dave/enhanced-ai-scripts:
    version: "^0.8"
    source: workshop
    feature: "smart-ai"

# Dev dependencies — only pulled for development/testing, never shipped to players
dev-dependencies:
  test-utils/map-validator:
    version: "^1.0"
    source: workshop
  test-utils/replay-differ:
    version: "^0.5"
    source: workshop

# Feature flags — named groups of optional functionality
features:
  default: []                         # features enabled by default
  hd-effects:                         # enables HD explosion effects
    - carol/hd-explosion-effects
  smart-ai:                           # enables enhanced AI
    - dave/enhanced-ai-scripts
  full:                               # meta-feature: everything
    - hd-effects
    - smart-ai

# Platform-conditional dependencies (rare, mainly for native code mods)
target:
  wasm32:
    dependencies:
      polyfill/wasm-audio-bridge:
        version: "^1.0"
        source: workshop
```

### Dependency Source Types

| Source | Description | Resolution |
|---|---|---|
| `workshop` | IC Workshop registry (official or federated) | Resolved via git-index or Workshop API |
| `local` | Path on disk | `path: "../my-local-sprites"` — not published, dev only |
| `git` | Git repository URL | `git: "https://github.com/user/repo"`, optional `branch`/`tag`/`rev` |
| `url` | Direct download URL | `url: "https://example.com/pkg.icpkg"` — pinned by checksum |

### Manifest Validation Rules

The `ic mod publish` command validates before upload:

1. `publisher/name` must match the authenticated publisher's scope
2. `version` must be valid semver and not already published
3. All `dependencies` must reference packages that exist in the registry
4. `version` ranges must parse correctly
5. `license` must be a valid SPDX expression
6. `ic_version` must reference a published IC engine version range
7. No circular dependencies (checked server-side across the full graph)

---

## 4. Registry Index Format

The Workshop git-index (Phase 0-3) uses a file-per-package layout inspired by crates.io's index format. This enables efficient git-based incremental updates — `git fetch` pulls only changed package files.

### Directory Layout

```
workshop-index/
  config.json                    # registry metadata
  1/                             # 1-char package names (rare)
  2/                             # 2-char package names
    ui/                          # publisher directories
  3/                             # 3-char package names
  co/                            # first 2 chars of package name (4+ chars)
    mm/                          # next 2 chars
      community-project/         # publisher scope
        hd-infantry-sprites      # one file per package (all versions)
  al/
    ic/
      alice/
        soviet-march-music
```

Packages with names of 1-3 characters use `1/`, `2/`, `3/` directories. Packages with 4+ characters use `first-two/next-two/publisher/name` to keep directory sizes manageable (same sharding as crates.io).

### config.json

```json
{
  "dl": "https://workshop.ironcurtain.gg/api/v1/packages/{publisher}/{name}/{version}/download",
  "api": "https://workshop.ironcurtain.gg",
  "allowed-registries": [
    "https://workshop.ironcurtain.gg",
    "https://community.example.org/workshop"
  ]
}
```

### Per-Package Index File Format

One JSON line per published version (append-only, newline-delimited JSON):

```json
{"name":"hd-infantry-sprites","vers":"1.0.0","publisher":"community-project","deps":[{"name":"base-palette","publisher":"ic-official","req":"^1.0","source":"workshop","optional":false,"default_features":true,"features":[]}],"cksum":"sha256:3a7bd3e2360a3d29eea436fcfb7e44c735d117c42d1c1835420b6b9942dd4f1a","manifest_hash":"sha256:e8b7c2f1a9d34e6b5c8a1d2f3e4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2","features":{"hd":["hd-textures-base"]},"yanked":false,"links":null}
{"name":"hd-infantry-sprites","vers":"1.1.0","publisher":"community-project","deps":[{"name":"base-palette","publisher":"ic-official","req":"^1.0","source":"workshop","optional":false,"default_features":true,"features":[]}],"cksum":"sha256:b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2","manifest_hash":"sha256:f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1","features":{"hd":["hd-textures-base"]},"yanked":false,"links":null}
{"name":"hd-infantry-sprites","vers":"2.0.0","publisher":"community-project","deps":[{"name":"base-palette","publisher":"ic-official","req":"^2.0","source":"workshop","optional":false,"default_features":true,"features":[]},{"name":"hd-textures-base","publisher":"ic-official","req":"^1.0","source":"workshop","optional":true,"default_features":true,"features":[]}],"cksum":"sha256:c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3","manifest_hash":"sha256:a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1","features":{"hd":["hd-textures-base"]},"yanked":false,"links":null}
{"name":"hd-infantry-sprites","vers":"2.1.0","publisher":"community-project","deps":[{"name":"base-palette","publisher":"ic-official","req":"^2.0","source":"workshop","optional":false,"default_features":true,"features":[]},{"name":"hd-textures-base","publisher":"ic-official","req":"^1.0","source":"workshop","optional":true,"default_features":true,"features":[]}],"cksum":"sha256:d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4","manifest_hash":"sha256:b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2","features":{"hd":["hd-textures-base"]},"yanked":false,"links":null}
{"name":"hd-infantry-sprites","vers":"2.1.1","publisher":"community-project","deps":[{"name":"base-palette","publisher":"ic-official","req":"^2.0","source":"workshop","optional":false,"default_features":true,"features":[]},{"name":"hd-textures-base","publisher":"ic-official","req":"^1.0","source":"workshop","optional":true,"default_features":true,"features":[]}],"cksum":"sha256:e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5","manifest_hash":"sha256:c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3","features":{"hd":["hd-textures-base"]},"yanked":false,"links":null}
```

### Index Entry Fields

| Field | Type | Description |
|---|---|---|
| `name` | string | Package name (without publisher scope) |
| `vers` | string | Semver version |
| `publisher` | string | Publisher scope |
| `deps` | array | Dependency list (name, publisher, req, source, optional, features) |
| `cksum` | string | `sha256:` prefixed hex digest of the `.icpkg` file |
| `manifest_hash` | string | `sha256:` of the `manifest.yaml` inside the `.icpkg` (D030 manifest confusion prevention) |
| `features` | object | Feature name -> list of enabled optional dependencies |
| `yanked` | bool | If true, excluded from new resolutions (existing lock files still work) |
| `links` | string or null | Sys-package link (prevents multiple packages linking same native lib) |

---

## 5. PubGrub Integration

### Mapping IC's Package Model to PubGrub

PubGrub operates on abstract `Package` and `Version` types. IC maps its domain model as follows:

```rust
use pubgrub::package::Package;
use pubgrub::version::Version;
use pubgrub::range::Range;
use pubgrub::solver::{resolve, Dependencies, DependencyProvider};
use semver::Version as SemVersion;

/// A Workshop package identity — publisher-scoped.
#[derive(Debug, Clone, Eq, PartialEq, Hash)]
pub enum IcPackage {
    /// The root manifest being resolved (not a real registry package).
    Root,
    /// A Workshop registry package.
    Registry {
        publisher: String,
        name: String,
    },
}

impl std::fmt::Display for IcPackage {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            IcPackage::Root => write!(f, "<root>"),
            IcPackage::Registry { publisher, name } => write!(f, "{publisher}/{name}"),
        }
    }
}

impl Package for IcPackage {}
```

### Version Adapter

PubGrub needs an ordered `Version` type. IC wraps `semver::Version`:

```rust
/// Newtype wrapper so semver::Version implements pubgrub::version::Version.
#[derive(Debug, Clone, Eq, PartialEq, Hash, Ord, PartialOrd)]
pub struct IcVersion(pub SemVersion);

impl std::fmt::Display for IcVersion {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl Version for IcVersion {
    fn lowest() -> Self {
        IcVersion(SemVersion::new(0, 0, 0))
    }

    fn bump(&self) -> Self {
        // Next patch version (used by PubGrub for range boundaries)
        let mut v = self.0.clone();
        v.patch += 1;
        v.pre = semver::Prerelease::EMPTY;
        IcVersion(v)
    }
}
```

### DependencyProvider Implementation

This is the core integration point. PubGrub calls `get_dependencies` to discover what a given package version requires.

```rust
pub struct WorkshopDependencyProvider {
    /// Cached registry index data: package -> sorted list of (version, deps, yanked).
    index_cache: HashMap<IcPackage, Vec<IndexEntry>>,
    /// Root manifest dependencies.
    root_deps: Vec<DependencySpec>,
    /// Versions currently in the lock file (preferred during resolution).
    locked_versions: HashMap<IcPackage, IcVersion>,
    /// Whether to allow yanked versions (only if already locked).
    allow_yanked_if_locked: bool,
}

impl DependencyProvider<IcPackage, IcVersion> for WorkshopDependencyProvider {
    fn choose_package_version<
        T: std::borrow::Borrow<IcPackage>,
        U: std::borrow::Borrow<Range<IcVersion>>,
    >(
        &self,
        potential_packages: impl Iterator<Item = (T, U)>,
    ) -> Result<(T, Option<IcVersion>), Box<dyn std::error::Error>> {
        // Strategy: pick the package with the fewest available versions
        // in the allowed range (smallest-first heuristic for faster resolution).
        // Within a package, pick the newest compatible version.
        let mut best = None;
        let mut best_count = usize::MAX;

        for (pkg, range) in potential_packages {
            let count = self.count_versions(pkg.borrow(), range.borrow());
            if count < best_count {
                best_count = count;
                let version = self.pick_newest_in_range(pkg.borrow(), range.borrow());
                best = Some((pkg, version));
            }
        }

        match best {
            Some((pkg, version)) => Ok((pkg, version)),
            None => unreachable!("PubGrub always provides at least one package"),
        }
    }

    fn get_dependencies(
        &self,
        package: &IcPackage,
        version: &IcVersion,
    ) -> Result<Dependencies<IcPackage, IcVersion>, Box<dyn std::error::Error>> {
        match package {
            IcPackage::Root => {
                // Return root manifest's dependencies as constraints.
                let mut deps = Map::new();
                for spec in &self.root_deps {
                    let pkg = IcPackage::Registry {
                        publisher: spec.publisher.clone(),
                        name: spec.name.clone(),
                    };
                    let range = semver_req_to_pubgrub_range(&spec.version_req)?;
                    deps.insert(pkg, range);
                }
                Ok(Dependencies::Known(deps))
            }
            IcPackage::Registry { publisher, name } => {
                let entry = self.lookup_index_entry(publisher, name, version)?;

                if entry.yanked && !self.is_locked(package, version) {
                    // Yanked and not locked — treat as unavailable.
                    return Ok(Dependencies::Unknown);
                }

                let mut deps = Map::new();
                for dep in &entry.deps {
                    if dep.optional && !self.is_feature_enabled(package, &dep.name) {
                        continue; // skip disabled optional deps
                    }
                    let pkg = IcPackage::Registry {
                        publisher: dep.publisher.clone(),
                        name: dep.name.clone(),
                    };
                    let range = semver_req_to_pubgrub_range(&dep.req)?;
                    deps.insert(pkg, range);
                }
                Ok(Dependencies::Known(deps))
            }
        }
    }
}
```

### Resolution Loop (Pseudocode)

```
FUNCTION resolve_workshop(manifest, index, lock_file) -> Result<LockFile, ResolutionError>:
    provider = WorkshopDependencyProvider::new(index, manifest.dependencies, lock_file)

    // PubGrub core resolution
    result = pubgrub::resolve(provider, IcPackage::Root, IcVersion(manifest.version))

    MATCH result:
        Ok(solution) ->
            // solution is Map<IcPackage, IcVersion>
            lock_entries = []
            FOR (package, version) IN solution:
                IF package == Root: CONTINUE
                entry = index.lookup(package, version)
                lock_entries.push(LockEntry {
                    name: package.full_name(),
                    version: version,
                    source: entry.source_url,
                    checksum: entry.cksum,
                    dependencies: entry.deps.map(|d| d.full_name()),
                })
            RETURN Ok(LockFile::new(lock_entries))

        Err(pubgrub_error) ->
            derivation_tree = pubgrub_error.derivation_tree()
            formatted = format_error_tree(derivation_tree)
            RETURN Err(ResolutionError::Conflict(formatted))
```

### Caching Strategy

| Data | Cache location | Refresh trigger |
|---|---|---|
| Git index (all package metadata) | `~/.ic/cache/workshop-index/` (bare git clone) | `ic mod update` runs `git fetch` |
| Individual `.icpkg` archives | `~/.ic/cache/packages/{publisher}/{name}/{version}/` | Never expires — immutable by D030 rules |
| Extracted package contents | `~/.ic/mods/{publisher}/{name}/{version}/` | Reinstall or version change |
| Resolution result | In-memory only (fast enough to recompute) | Every `ic mod install` / `ic mod update` |

The git-index is cloned as a bare repository. On `ic mod update`, IC runs `git fetch origin` and reads updated package files. Delta compression keeps incremental fetches small — typically a few KB even for registries with thousands of packages.

---

## 6. Diamond Dependency Handling

Diamond dependencies are the most common cause of resolution conflicts in any package ecosystem. IC's resolver handles them via PubGrub's incompatibility propagation.

### Example: Successful Diamond Resolution

```
root mod "desert-storm-tc" depends on:
    alice/tank-ai        ^1.0
    bob/pathfinding-lib   ^2.0

alice/tank-ai@1.2.0 depends on:
    shared/math-utils    ^1.5

bob/pathfinding-lib@2.1.0 depends on:
    shared/math-utils    ^1.3
```

PubGrub resolves `shared/math-utils` to the newest version satisfying BOTH `^1.5` AND `^1.3` — which is `^1.5` (the intersection). If `shared/math-utils@1.8.0` exists, that is selected. One copy, no duplication.

### Example: Conflicting Diamond (Failure)

```
root mod "mega-overhaul" depends on:
    alice/retro-sprites   ^1.0
    bob/hd-ui-theme       ^1.0

alice/retro-sprites@1.3.0 depends on:
    shared/base-palette   ^1.0        (requires 1.x)

bob/hd-ui-theme@1.1.0 depends on:
    shared/base-palette   ^2.0        (requires 2.x)
```

These constraints are **unsatisfiable**: `shared/base-palette ^1.0` and `^2.0` have no intersection.

### PubGrub Incompatibility Derivation

PubGrub builds a derivation tree:

```
Incompatibility 1: alice/retro-sprites ^1.0 requires shared/base-palette ^1.0
    (from: alice/retro-sprites@1.3.0 dependency declaration)

Incompatibility 2: bob/hd-ui-theme ^1.0 requires shared/base-palette ^2.0
    (from: bob/hd-ui-theme@1.1.0 dependency declaration)

Incompatibility 3 (derived): alice/retro-sprites ^1.0 is incompatible with bob/hd-ui-theme ^1.0
    (because: both require shared/base-palette but with non-overlapping ranges)

Incompatibility 4 (derived): root is unsatisfiable
    (because: root requires alice/retro-sprites ^1.0 AND bob/hd-ui-theme ^1.0,
     which are incompatible per Incompatibility 3)
```

### Formatted Error Output

See Section 9 for the full formatted error message for this scenario.

### User Resolution Strategies

When a diamond conflict occurs, the error message includes actionable suggestions:

1. **Update the constraining package:** If `alice/retro-sprites@2.0.0` exists and requires `shared/base-palette ^2.0`, updating to `^2.0` resolves the conflict.
2. **Pin the conflicting dependency:** If a version of `shared/base-palette` exists that satisfies both (unlikely for `^1.0` vs `^2.0`, but possible for narrower ranges like `^1.5` vs `>=1.3, <2.0`).
3. **Contact the package author:** File an issue asking them to loosen the constraint.
4. **Fork and patch:** `ic mod fork alice/retro-sprites` creates a local copy the user can modify.

---

## 7. Lock File Format (`ic.lock`)

The lock file records the exact result of dependency resolution: every resolved package, its version, source, checksum, and dependency edges. It is the single source of truth for reproducible installs.

### Format Specification

TOML format, consistent with Cargo's `Cargo.lock`:

```toml
# ic.lock — auto-generated by `ic mod install` / `ic mod update`
# Do not edit manually. Commit this file to version control.

[metadata]
ic_lock_version = 1
generated_by = "ic 0.3.2"
generated_at = "2026-02-26T14:30:00Z"
index_commit = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0"
index_url = "https://github.com/nicot/workshop-index.git"

[[package]]
name = "community-project/hd-infantry-sprites"
version = "2.1.1"
source = "workshop+https://workshop.ironcurtain.gg"
checksum = "sha256:e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5"
dependencies = [
    "ic-official/base-palette",
]

[[package]]
name = "ic-official/base-palette"
version = "2.0.3"
source = "workshop+https://workshop.ironcurtain.gg"
checksum = "sha256:f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6"
dependencies = []

[[package]]
name = "alice/soviet-march-music"
version = "2.0.1"
source = "workshop+https://workshop.ironcurtain.gg"
checksum = "sha256:a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7"
dependencies = []

[[package]]
name = "bob/desert-terrain-textures"
version = "1.4.2"
source = "workshop+https://workshop.ironcurtain.gg"
checksum = "sha256:b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8"
dependencies = [
    "ic-official/base-palette",
]
```

### Lock File Fields

| Field | Type | Description |
|---|---|---|
| `ic_lock_version` | int | Lock file format version (currently `1`). Allows future format migrations. |
| `generated_by` | string | IC CLI version that generated this lock file. |
| `generated_at` | string | ISO 8601 timestamp of generation. |
| `index_commit` | string | Git commit hash of the workshop-index at resolution time. |
| `index_url` | string | URL of the git-index repository used. |
| `name` | string | Full `publisher/name` package identity. |
| `version` | string | Exact resolved semver version. |
| `source` | string | Source URL with scheme prefix (`workshop+`, `git+`, `path+`). Prevents dependency confusion across federated sources (D030 / `06-SECURITY.md` Vuln 22). |
| `checksum` | string | `sha256:` prefixed hex digest of the `.icpkg` archive. |
| `dependencies` | array of string | List of `publisher/name` identities this package depends on. Versions are not repeated here — they are resolved by looking up each name in the `[[package]]` entries. |

### Lock File Commands

| Command | Behavior |
|---|---|
| `ic mod install` | Reads `ic.lock`, downloads exact versions listed. If `ic.lock` does not exist, resolves from `ic-mod.yaml` and creates it. |
| `ic mod install --locked` | Reads `ic.lock` and installs exactly what it specifies. Fails if `ic-mod.yaml` has changed since `ic.lock` was generated (new deps, changed version ranges). Used in CI to guarantee reproducibility. |
| `ic mod update` | Re-resolves all dependencies from `ic-mod.yaml` against the latest registry state. Overwrites `ic.lock`. |
| `ic mod update alice/soviet-march-music` | Re-resolves only `alice/soviet-march-music` and its transitive dependencies. Other packages stay at their locked versions. Useful for targeted updates without churn. |
| `ic mod lock` | Alias for `ic mod update` — regenerates `ic.lock` without installing. |

### Merge Conflict Resolution

When two branches modify `ic.lock` and conflict on merge, IC provides:

```
ic mod lock --resolve-conflicts
```

This re-resolves from the merged `ic-mod.yaml`, producing a clean `ic.lock`. The command is safe because `ic.lock` is always derivable from `ic-mod.yaml` + registry state.

---

## 8. Determinism Guarantee

IC Workshop guarantees **deterministic resolution**: the same inputs always produce the same `ic.lock` output.

### What Counts as "Same Inputs"

1. **Root manifest (`ic-mod.yaml`):** The dependency declarations and version ranges.
2. **Registry state:** The contents of the git-index at a specific commit hash.
3. **PubGrub algorithm version:** The resolver's version selection heuristics.

If all three are identical, the resolution output is byte-identical.

### How Determinism Is Enforced

1. **PubGrub is inherently deterministic.** Given the same set of available packages and constraints, it always produces the same solution. There is no randomness in version selection — the `choose_package_version` heuristic is deterministic (smallest-domain-first, then newest version).

2. **Registry state is pinned.** The `ic.lock` metadata section records `index_commit` — the exact git commit hash of the workshop-index at resolution time. This means:
   - Two developers with the same `ic-mod.yaml` and the same index commit will always get identical lock files.
   - `ic mod install` uses the locked index commit, not the latest.
   - `ic mod update` fetches the latest index and records the new commit hash.

3. **No floating resolution.** The lock file is the source of truth for installs. `ic mod install` never re-resolves — it reads `ic.lock` and downloads exactly those versions. Only `ic mod update` triggers re-resolution.

4. **`--locked` mode for CI.** `ic mod install --locked` verifies that `ic-mod.yaml` is consistent with `ic.lock` and fails if they diverge:

```
error: lock file out of date

  The following dependencies in ic-mod.yaml are not reflected in ic.lock:
    + carol/hd-explosion-effects ^1.0  (added)
    ~ alice/soviet-march-music ">=1.0, <3.0" -> ">=2.0, <3.0"  (changed)

  Run `ic mod update` to regenerate the lock file.
```

### Cross-Platform Reproducibility

Since IC's simulation is deterministic and platform-independent (D001), and the resolver is deterministic, a mod's full dependency tree is reproducible across Windows, macOS, Linux, and WASM. The same `ic.lock` file produces the same installed packages on every platform.

---

## 9. Error Reporting

PubGrub's greatest advantage over SAT solvers is its ability to produce structured, human-readable error explanations. IC formats PubGrub's `DerivationTree` into terminal-friendly error messages using a consistent format.

### Error Format Structure

```
error: failed to resolve dependencies

  <conflict explanation with box-drawing characters>

  help: <actionable suggestion>
```

### Scenario 1: Incompatible Transitive Dependency (Diamond Conflict)

```
error: failed to resolve dependencies

  x alice/retro-sprites ^1.0 requires shared/base-palette ^1.0
  | but bob/hd-ui-theme ^1.0 requires shared/base-palette ^2.0
  |
  +-- shared/base-palette ^1.0 and ^2.0 are incompatible
      (no version of shared/base-palette satisfies both ranges)

  help: try one of:
    - update alice/retro-sprites to >=2.0 (v2.0.0 requires shared/base-palette ^2.0)
    - update bob/hd-ui-theme to >=1.2 (v1.2.0 requires shared/base-palette ^1.5)
    - fork alice/retro-sprites and update its shared/base-palette requirement
```

### Scenario 2: No Version Satisfies Constraint

```
error: failed to resolve dependencies

  x community-project/hd-infantry-sprites ^3.0 is required by ic-mod.yaml
  |
  +-- no version of community-project/hd-infantry-sprites matches ^3.0
      (available versions: 1.0.0, 1.1.0, 2.0.0, 2.1.0, 2.1.1)

  help: the latest version is 2.1.1
    - change the requirement to "^2.0" to use the latest major version
    - run `ic mod search community-project/hd-infantry-sprites` to see all versions
```

### Scenario 3: Yanked Version in Lock File

```
warning: using yanked version

  ! alice/soviet-march-music@1.2.0 has been yanked
  | reason: "contains corrupted audio file in track 3"
  |
  +-- this version is still installed because it's in your ic.lock
      run `ic mod update alice/soviet-march-music` to upgrade

  advisory: check `ic mod audit` for security advisories
```

### Scenario 4: Deep Transitive Conflict

```
error: failed to resolve dependencies

  x resolution failed for shared/math-utils
  |
  | Because alice/tank-ai ^1.0 depends on shared/math-utils ^1.5
  | and bob/pathfinding-lib ^2.0 depends on shared/math-utils ^3.0,
  | alice/tank-ai ^1.0 is incompatible with bob/pathfinding-lib ^2.0.
  |
  | And because root depends on alice/tank-ai ^1.0
  | and root depends on bob/pathfinding-lib ^2.0,
  | the root dependencies are unsatisfiable.
  |
  +-- shared/math-utils ^1.5 and ^3.0 have no overlap

  dependency chain:
    root -> alice/tank-ai@1.2.0 -> shared/math-utils ^1.5
    root -> bob/pathfinding-lib@2.1.0 -> shared/math-utils ^3.0

  help: try one of:
    - update alice/tank-ai to >=2.0 (v2.0.0 requires shared/math-utils ^3.0)
    - pin bob/pathfinding-lib to "~2.0" and check if older patch works with ^1.5
    - contact the package authors to coordinate a shared/math-utils migration
```

### Error Formatting Implementation

```rust
/// Format a PubGrub DerivationTree into IC's error message format.
pub fn format_resolution_error(
    tree: &DerivationTree<IcPackage, IcVersion>,
) -> String {
    let mut output = String::from("error: failed to resolve dependencies\n\n");

    // Walk the derivation tree and format each incompatibility.
    let lines = collect_incompatibilities(tree);
    for line in &lines {
        match line {
            IncompatLine::External { package, range, reason } => {
                output.push_str(&format!("  x {package} {range} {reason}\n"));
            }
            IncompatLine::Derived { cause, consequence } => {
                output.push_str(&format!("  | {cause}\n"));
                output.push_str(&format!("  +-- {consequence}\n"));
            }
        }
    }

    // Append help suggestions based on conflict type.
    let suggestions = generate_suggestions(tree);
    if !suggestions.is_empty() {
        output.push_str("\n  help: try one of:\n");
        for suggestion in suggestions {
            output.push_str(&format!("    - {suggestion}\n"));
        }
    }

    output
}
```

---

## 10. Performance

### Complexity Analysis

PubGrub's worst-case time complexity is **O(n * m)** where:
- **n** = number of distinct packages in the dependency graph
- **m** = maximum number of versions per package

In practice, PubGrub is much faster than worst case because conflict-driven clause learning prunes large portions of the search space.

### Workshop Scale Estimates

| Metric | IC Workshop (Year 1) | IC Workshop (Year 5) | crates.io (for reference) |
|---|---|---|---|
| Total packages | ~100 | ~5,000 | ~150,000 |
| Max versions per package | ~20 | ~100 | ~500 |
| Typical dependency depth | 2-3 | 3-5 | 5-15 |
| Typical dependency breadth | 3-5 | 5-15 | 10-50 |

### Expected Resolution Times

Benchmarks measured on a mid-range machine (Ryzen 5, 16 GB RAM). All times are wall-clock for the resolution step only (not download/install):

| Dependency graph size | Packages in solution | Expected resolution time |
|---|---|---|
| Simple mod (3-5 deps) | 5-10 | <1 ms |
| Medium mod (10-20 deps) | 15-40 | 1-5 ms |
| Large total conversion (30-50 deps) | 50-100 | 5-20 ms |
| Pathological stress test (200 deps, deep diamonds) | 200-500 | 20-80 ms |
| Extreme stress test (500 packages, many conflicts) | 500+ | 50-200 ms |

Resolution will always complete in <100 ms for any realistic IC Workshop dependency graph. This is effectively instant from a user-experience perspective.

### Index Caching Performance

| Operation | Time | Data transferred |
|---|---|---|
| First index clone (empty cache) | 1-5 s | 1-10 MB (depends on registry size) |
| Incremental `git fetch` (daily update) | 0.1-1 s | 1-100 KB (delta compressed) |
| Read package metadata from local index | <1 ms | Local disk I/O only |
| Full re-resolution from cached index | <100 ms | No network |

### Optimization Strategies

1. **Prefer locked versions.** When `ic.lock` exists, the resolver pre-populates PubGrub's solution with locked versions. PubGrub only needs to resolve newly added or changed dependencies — typically a tiny subset.

2. **Lazy index loading.** The resolver doesn't load the entire index into memory. It reads package files on demand as PubGrub requests them. With OS-level file caching, repeated reads are effectively free.

3. **Version pre-filtering.** Before passing versions to PubGrub, IC filters out:
   - Yanked versions (unless locked)
   - Pre-release versions (unless the constraint explicitly allows them)
   - Versions outside the broadest constraint range

This reduces the search space before PubGrub even starts.

---

## 11. Yanking and Security Advisories

### Yanked Versions

A yanked version is a version that the publisher has retracted — typically because it contains a serious bug, corrupted assets, or accidental content. Per D030's Version Immutability rules, yanking does **not** delete the version. It marks it as unavailable for new installs.

**Yank semantics:**

| Context | Yanked version behavior |
|---|---|
| New resolution (no lock file) | **Excluded.** PubGrub treats yanked versions as non-existent. |
| Existing lock file references it | **Allowed.** `ic mod install` still downloads and installs it. A warning is printed. |
| `ic mod update` | **Excluded.** Re-resolution picks a non-yanked replacement. |
| `--locked` mode | **Allowed.** Lock file is authoritative. Warning printed. |

**Yank/unyank commands:**

```
ic mod yank alice/soviet-march-music@1.2.0 --reason "corrupted track 3"
ic mod unyank alice/soviet-march-music@1.2.0
```

Yanking updates the index entry's `yanked` field to `true` and records the reason. The `.icpkg` archive remains available for download (lock file compatibility).

### Content Advisory Records (CARs)

CARs are structured security/content advisories for Workshop packages — analogous to RustSec advisories. They are separate from yanking: a CAR warns about a known issue without preventing installation.

**CAR integration with resolution:**

1. If a resolved version has a **blocking CAR** (severity: `critical`), the resolver treats it as yanked — excluded from new resolution unless locked.
2. If a resolved version has a **warning CAR** (severity: `moderate` or `low`), resolution succeeds but prints a warning.
3. The `ic mod audit` command checks all installed packages against current CARs.

**`ic mod audit` output example:**

```
$ ic mod audit

  Checking 12 installed packages against advisory database...

  ! CRITICAL  CAR-2026-0042: alice/soviet-march-music@1.2.0
    Title: Corrupted audio causes crash on macOS ARM
    Affected: <1.2.1
    Fix: update to >=1.2.1
    More info: https://workshop.ironcurtain.gg/advisories/CAR-2026-0042

  ~ WARNING   CAR-2026-0089: bob/desert-terrain-textures@1.4.0
    Title: Missing mipmap for snow tile causes visual artifact
    Affected: >=1.4.0, <1.4.2
    Fix: update to >=1.4.2
    More info: https://workshop.ironcurtain.gg/advisories/CAR-2026-0089

  Found 1 critical, 1 warning advisory.
  Run `ic mod update` to get fixed versions.
```

**CAR database location:** Stored as structured YAML/TOML files in the git-index repository under an `advisories/` directory. Fetched alongside the package index during `git fetch`. See `research/content-advisory-protocol-design.md` for the full CAR specification.

---

## 12. Rust Type Definitions

The complete type definitions for IC Workshop's dependency resolution system.

### Core Identity Types

```rust
use std::collections::HashMap;
use std::fmt;
use semver::{Version, VersionReq};

/// A publisher-scoped package name.
/// Invariant: publisher and name are lowercase, ASCII, hyphens allowed.
#[derive(Debug, Clone, Eq, PartialEq, Hash, Ord, PartialOrd)]
pub struct PackageName {
    pub publisher: String,
    pub name: String,
}

impl PackageName {
    pub fn new(publisher: impl Into<String>, name: impl Into<String>) -> Self {
        Self {
            publisher: publisher.into(),
            name: name.into(),
        }
    }

    /// Parse "publisher/name" format.
    pub fn parse(s: &str) -> Result<Self, PackageNameError> {
        let (publisher, name) = s
            .split_once('/')
            .ok_or_else(|| PackageNameError::MissingSlash(s.to_string()))?;
        // Validate: lowercase ASCII + hyphens, non-empty, no leading/trailing hyphens.
        validate_segment(publisher)?;
        validate_segment(name)?;
        Ok(Self::new(publisher, name))
    }

    pub fn full_name(&self) -> String {
        format!("{}/{}", self.publisher, self.name)
    }
}

impl fmt::Display for PackageName {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}/{}", self.publisher, self.name)
    }
}

#[derive(Debug, thiserror::Error)]
pub enum PackageNameError {
    #[error("package name must contain '/': got `{0}`")]
    MissingSlash(String),
    #[error("invalid segment `{0}`: must be lowercase ASCII with hyphens, 1-64 chars")]
    InvalidSegment(String),
}
```

### Version Types

```rust
/// A parsed semver version, wrapping the `semver` crate's Version.
pub type SemVer = Version;

/// A parsed version requirement (range expression).
pub type VersionRange = VersionReq;

/// Dependency specification as declared in ic-mod.yaml.
#[derive(Debug, Clone)]
pub struct DependencySpec {
    pub package: PackageName,
    pub version_req: VersionReq,
    pub source: DependencySource,
    pub optional: bool,
    pub default_features: bool,
    pub features: Vec<String>,
}

/// Where a dependency comes from.
#[derive(Debug, Clone, Eq, PartialEq)]
pub enum DependencySource {
    /// Workshop registry (official or federated).
    Workshop {
        registry_url: Option<String>,
    },
    /// Local path (development only).
    Local {
        path: std::path::PathBuf,
    },
    /// Git repository.
    Git {
        url: String,
        reference: GitReference,
    },
    /// Direct URL download.
    Url {
        url: String,
        checksum: String,
    },
}

#[derive(Debug, Clone, Eq, PartialEq)]
pub enum GitReference {
    Branch(String),
    Tag(String),
    Rev(String),
    DefaultBranch,
}
```

### Registry Types

```rust
/// A single version entry in the registry index.
#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
pub struct RegistryEntry {
    pub name: String,
    pub vers: String,
    pub publisher: String,
    pub deps: Vec<RegistryDep>,
    pub cksum: String,
    pub manifest_hash: String,
    pub features: HashMap<String, Vec<String>>,
    pub yanked: bool,
    pub links: Option<String>,
}

/// A dependency as recorded in the registry index.
#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
pub struct RegistryDep {
    pub name: String,
    pub publisher: String,
    pub req: String,
    pub source: String,
    pub optional: bool,
    pub default_features: bool,
    pub features: Vec<String>,
}
```

### Resolution Output Types

```rust
/// A fully resolved package in the lock file.
#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
pub struct ResolvedPackage {
    pub name: String,          // "publisher/name"
    pub version: String,       // exact semver
    pub source: String,        // "workshop+https://..." or "git+https://..." or "path+..."
    pub checksum: String,      // "sha256:hex..."
    pub dependencies: Vec<String>, // list of "publisher/name" (versions in their own entries)
}

/// The complete lock file structure.
#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
pub struct LockFile {
    pub metadata: LockMetadata,
    pub package: Vec<ResolvedPackage>,
}

#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
pub struct LockMetadata {
    pub ic_lock_version: u32,
    pub generated_by: String,
    pub generated_at: String,       // ISO 8601
    pub index_commit: String,       // git commit hash
    pub index_url: String,
}

impl LockFile {
    /// Parse an ic.lock file from TOML.
    pub fn from_toml(s: &str) -> Result<Self, toml::de::Error> {
        toml::from_str(s)
    }

    /// Serialize to TOML for writing.
    pub fn to_toml(&self) -> Result<String, toml::ser::Error> {
        toml::to_string_pretty(self)
    }

    /// Look up a locked version for a package.
    pub fn locked_version(&self, name: &PackageName) -> Option<&ResolvedPackage> {
        let full = name.full_name();
        self.package.iter().find(|p| p.name == full)
    }

    /// Check if the lock file is consistent with a manifest's dependencies.
    pub fn is_consistent_with(&self, manifest_deps: &[DependencySpec]) -> ConsistencyCheck {
        let mut added = Vec::new();
        let mut removed = Vec::new();
        let mut changed = Vec::new();

        let locked_names: std::collections::HashSet<&str> =
            self.package.iter().map(|p| p.name.as_str()).collect();
        let manifest_names: std::collections::HashSet<String> =
            manifest_deps.iter().map(|d| d.package.full_name()).collect();

        for dep in manifest_deps {
            let full = dep.package.full_name();
            if !locked_names.contains(full.as_str()) {
                added.push(full);
            } else if let Some(locked) = self.locked_version(&dep.package) {
                let locked_ver: Version = locked.version.parse().unwrap();
                if !dep.version_req.matches(&locked_ver) {
                    changed.push((full, dep.version_req.to_string()));
                }
            }
        }

        for pkg in &self.package {
            if !manifest_names.contains(&pkg.name) {
                removed.push(pkg.name.clone());
            }
        }

        if added.is_empty() && removed.is_empty() && changed.is_empty() {
            ConsistencyCheck::Consistent
        } else {
            ConsistencyCheck::Inconsistent { added, removed, changed }
        }
    }
}

#[derive(Debug)]
pub enum ConsistencyCheck {
    Consistent,
    Inconsistent {
        added: Vec<String>,
        removed: Vec<String>,
        changed: Vec<(String, String)>,
    },
}
```

### Error Types

```rust
/// Errors from the dependency resolution process.
#[derive(Debug, thiserror::Error)]
pub enum ResolutionError {
    #[error("failed to resolve dependencies:\n{formatted_message}")]
    Conflict {
        formatted_message: String,
        derivation_tree: String,  // raw PubGrub derivation for debugging
    },

    #[error("package not found: {package}")]
    PackageNotFound {
        package: PackageName,
    },

    #[error("no version of {package} matches {requirement}")]
    NoMatchingVersion {
        package: PackageName,
        requirement: VersionReq,
        available: Vec<Version>,
    },

    #[error("registry index error: {message}")]
    IndexError {
        message: String,
        source: Option<Box<dyn std::error::Error + Send + Sync>>,
    },

    #[error("lock file inconsistent with manifest")]
    LockfileInconsistent {
        check: ConsistencyCheck,
    },

    #[error("version parse error: {0}")]
    VersionParse(#[from] semver::Error),
}

/// Errors from version parsing.
#[derive(Debug, thiserror::Error)]
pub struct VersionParseError {
    pub input: String,
    pub reason: String,
}

impl fmt::Display for VersionParseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "invalid version `{}`: {}", self.input, self.reason)
    }
}

#[derive(Debug, thiserror::Error)]
pub struct VersionReqParseError {
    pub input: String,
    pub reason: String,
}

impl fmt::Display for VersionReqParseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "invalid version requirement `{}`: {}", self.input, self.reason)
    }
}
```

### DependencyProvider Trait Implementation (Complete Sketch)

```rust
use pubgrub::solver::{Dependencies, DependencyProvider};
use pubgrub::range::Range;
use pubgrub::type_aliases::Map;

pub struct WorkshopDependencyProvider {
    /// Registry index: maps package name -> list of (version, entry) sorted newest first.
    index: HashMap<PackageName, Vec<(SemVer, RegistryEntry)>>,
    /// Root manifest dependencies.
    root_deps: Vec<DependencySpec>,
    /// Locked versions from ic.lock (preferred during resolution).
    locked: HashMap<PackageName, SemVer>,
    /// Enabled features per package.
    enabled_features: HashMap<PackageName, Vec<String>>,
}

impl WorkshopDependencyProvider {
    /// Load the index for a specific package from the local git-index cache.
    fn ensure_index_loaded(&mut self, pkg: &PackageName) -> Result<(), ResolutionError> {
        if self.index.contains_key(pkg) {
            return Ok(());
        }
        let index_path = self.index_path_for(pkg);
        let entries = read_index_file(&index_path)?;
        self.index.insert(pkg.clone(), entries);
        Ok(())
    }

    /// Compute the file path in the git-index for a given package.
    fn index_path_for(&self, pkg: &PackageName) -> std::path::PathBuf {
        let name = &pkg.name;
        let prefix = match name.len() {
            1 => format!("1/{}", pkg.publisher),
            2 => format!("2/{}", pkg.publisher),
            3 => format!("3/{}", pkg.publisher),
            _ => {
                let c1 = &name[..2];
                let c2 = &name[2..4.min(name.len())];
                format!("{}/{}/{}", c1, c2, pkg.publisher)
            }
        };
        self.index_root.join(prefix).join(name)
    }

    /// Get all non-yanked versions in a range, sorted newest first.
    fn versions_in_range(
        &self,
        pkg: &PackageName,
        range: &Range<IcVersion>,
    ) -> Vec<&(SemVer, RegistryEntry)> {
        self.index
            .get(pkg)
            .map(|entries| {
                entries
                    .iter()
                    .filter(|(v, e)| {
                        range.contains(&IcVersion(v.clone()))
                            && (!e.yanked || self.locked.get(pkg) == Some(v))
                    })
                    .collect()
            })
            .unwrap_or_default()
    }
}

impl DependencyProvider<IcPackage, IcVersion> for WorkshopDependencyProvider {
    fn choose_package_version<
        T: std::borrow::Borrow<IcPackage>,
        U: std::borrow::Borrow<Range<IcVersion>>,
    >(
        &self,
        potential_packages: impl Iterator<Item = (T, U)>,
    ) -> Result<(T, Option<IcVersion>), Box<dyn std::error::Error>> {
        // Heuristic: pick package with fewest available versions (fail-fast).
        // Prefer locked versions when available.
        let mut best_pkg = None;
        let mut best_count = usize::MAX;
        let mut best_version = None;

        for (pkg_ref, range_ref) in potential_packages {
            let pkg = pkg_ref.borrow();
            let range = range_ref.borrow();

            match pkg {
                IcPackage::Root => {
                    // Root always selected immediately.
                    return Ok((pkg_ref, Some(IcVersion(SemVer::new(0, 0, 0)))));
                }
                IcPackage::Registry { publisher, name } => {
                    let pkg_name = PackageName::new(publisher.clone(), name.clone());
                    let versions = self.versions_in_range(&pkg_name, range);
                    let count = versions.len();

                    if count < best_count {
                        best_count = count;
                        // Prefer locked version if it's in range.
                        let locked_v = self.locked.get(&pkg_name)
                            .filter(|v| range.contains(&IcVersion((*v).clone())))
                            .cloned();
                        best_version = locked_v
                            .or_else(|| versions.first().map(|(v, _)| v.clone()))
                            .map(IcVersion);
                        best_pkg = Some(pkg_ref);
                    }
                }
            }
        }

        match best_pkg {
            Some(pkg) => Ok((pkg, best_version)),
            None => unreachable!("PubGrub always provides at least one candidate"),
        }
    }

    fn get_dependencies(
        &self,
        package: &IcPackage,
        version: &IcVersion,
    ) -> Result<Dependencies<IcPackage, IcVersion>, Box<dyn std::error::Error>> {
        match package {
            IcPackage::Root => {
                let mut deps = Map::new();
                for spec in &self.root_deps {
                    let pkg = IcPackage::Registry {
                        publisher: spec.package.publisher.clone(),
                        name: spec.package.name.clone(),
                    };
                    let range = semver_req_to_pubgrub_range(&spec.version_req)?;
                    deps.insert(pkg, range);
                }
                Ok(Dependencies::Known(deps))
            }
            IcPackage::Registry { publisher, name } => {
                let pkg_name = PackageName::new(publisher, name);
                let entries = self.index.get(&pkg_name)
                    .ok_or_else(|| ResolutionError::PackageNotFound {
                        package: pkg_name.clone(),
                    })?;

                let entry = entries
                    .iter()
                    .find(|(v, _)| *v == version.0)
                    .map(|(_, e)| e)
                    .ok_or_else(|| ResolutionError::NoMatchingVersion {
                        package: pkg_name.clone(),
                        requirement: VersionReq::STAR,
                        available: entries.iter().map(|(v, _)| v.clone()).collect(),
                    })?;

                if entry.yanked && self.locked.get(&pkg_name) != Some(&version.0) {
                    return Ok(Dependencies::Unknown);
                }

                let enabled = self.enabled_features.get(&pkg_name);
                let mut deps = Map::new();

                for dep in &entry.deps {
                    // Skip optional deps unless their feature is enabled.
                    if dep.optional {
                        let feat_enabled = enabled
                            .map(|f| f.iter().any(|feat| {
                                entry.features.get(feat)
                                    .map(|deps| deps.contains(&dep.name))
                                    .unwrap_or(false)
                            }))
                            .unwrap_or(false);
                        if !feat_enabled {
                            continue;
                        }
                    }

                    let dep_pkg = IcPackage::Registry {
                        publisher: dep.publisher.clone(),
                        name: dep.name.clone(),
                    };
                    let req: VersionReq = dep.req.parse()?;
                    let range = semver_req_to_pubgrub_range(&req)?;
                    deps.insert(dep_pkg, range);
                }

                Ok(Dependencies::Known(deps))
            }
        }
    }
}

/// Convert a semver::VersionReq to a pubgrub::Range<IcVersion>.
fn semver_req_to_pubgrub_range(
    req: &VersionReq,
) -> Result<Range<IcVersion>, Box<dyn std::error::Error>> {
    // The pubgrub crate's Range type supports intersection and union.
    // We iterate over the comparators in the VersionReq and build the range.
    //
    // For ^1.2.3: Range::between(IcVersion(1.2.3), IcVersion(2.0.0))
    // For ~1.2.3: Range::between(IcVersion(1.2.3), IcVersion(1.3.0))
    // For >=1.0, <2.0: intersection of Range::higher_than(1.0) and Range::strictly_lower_than(2.0)
    //
    // Implementation delegates to semver crate for comparator semantics,
    // then maps to pubgrub Range operations.

    let mut range = Range::full();
    for comparator in &req.comparators {
        let comp_range = comparator_to_range(comparator)?;
        range = range.intersection(&comp_range);
    }
    Ok(range)
}
```

---

## Cross-References

- **D030 — Workshop Resource Registry & Dependency System** (`src/decisions/09e/D030-workshop-registry.md`): Defines the Workshop package model, dependency declaration format, lock file semantics, and registry architecture that this document designs the resolver for.
- **D049 — Workshop Asset Formats & Distribution** (`src/decisions/09e/D049-workshop-assets.md`): Defines `.icpkg` archive format, P2P delivery, canonical asset formats, and content integrity verification.
- **research/content-advisory-protocol-design.md**: (Planned) Full specification for Content Advisory Records (CARs), advisory database format, and `ic mod audit` behavior.
