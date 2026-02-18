# uBlock Origin — Pattern Matching Architecture Analysis

> **Relevance to Iron Curtain:** Community-maintained rule systems, high-throughput pattern matching, flat-array data structures, trust-tiered rule composition. Applicable to relay-side behavioral analysis, Workshop content moderation, and order validation dispatch. Note: uBO uses WASM because browsers cannot run native code — WASM is the fastest execution option in that constrained sandbox. IC compiles Rust directly to native machine code, which is faster than WASM. WASM's value in IC is sandboxing (D005 mods) and portability (browser target), not performance.

## What uBlock Origin Is

uBlock Origin (uBO) is a GPL-3.0 browser content blocker by Raymond Hill. It evaluates ~300,000+ filter rules against every network request in real time — typically completing a full match in <1ms while consuming <200MB RAM. It is the best-in-class example of efficient pattern matching against a large community-maintained rule corpus.

- **Repository:** https://github.com/gorhill/uBlock
- **License:** GPL-3.0
- **Language:** JavaScript + WebAssembly (2.1% of codebase)
- **Core files studied:** `static-net-filtering.js` (6K lines, the filtering engine), `biditrie.js`/`biditrie.wasm` (compact trie), `hntrie.js`/`hntrie.wasm` (hostname trie), `filtering-context.js`

## Architecture Overview

uBO's filtering engine solves a problem structurally similar to IC's relay-side security: classify high-volume input (URLs / player orders) against a large rule set (filter lists / cheat signatures + validation rules) in real time with minimal overhead.

### Three-Layer Evaluation (Cheapest First)

uBO evaluates requests through three layers, ordered by cost:

1. **Dynamic URL filtering** — O(1) hashmap lookup by URL prefix. Can allow or block. Cheapest to evaluate and cheapest to modify (point-and-click UI, no recompilation).
2. **Dynamic filtering rules** — O(1) lookup by (hostname, request type) pair. Medium cost. Overrides static filters.
3. **Static network filters** — Full pattern matching against ~300K compiled rules. Most flexible syntax (wildcards, regex, anchors, domain scoping). Most expensive. Must be "compiled" (batch-loaded) ahead of time.

**Key property:** About 60% of requests are resolved by layers 1-2 before the expensive static engine is ever consulted. The cheap layers handle the common cases; the expensive layer handles the long tail.

**IC parallel — Three-Layer Rate Control (V17):**

IC's relay already has three layers: hard ceiling (`ProtocolLimits`), bandwidth throttle, and time-budget pool (`OrderBudget`). uBO validates that cheapest-first ordering is the correct architecture. The hard ceiling (analogous to dynamic URL filtering) should catch the vast majority of abuse — malformed packets, absurd order counts — before the EWMA or behavioral profile systems are consulted.

### Token-Based Fast-Path Dispatch

The central performance insight is **token extraction**. For each request URL, uBO extracts a "best token" — a 1-7 character substring chosen to minimize bucket collisions. Tokens are used as keys into a `Map<tokenHash, FilterBucket>`. Only filters in the matching bucket are evaluated.

The `badTokens` table explicitly blacklists overly common tokens (`https`, `com`, `www`, `js`, `jpg`, `css`, `png`, `static`, `net`, `de`, `img`, `assets`...) that would cause too many bucket collisions and degrade performance. This table is empirically tuned against real-world URL distributions.

```javascript
// From static-net-filtering.js — top "bad tokens" by occurrence frequency
// across 200K+ URLs benchmarked against default filter lists
this.badTokens = new Map([
    [ 'https', 123617 ],
    [ 'com',    76987 ],
    [ 'js',     43620 ],
    [ 'www',    33129 ],
    [ 'jpg',    32221 ],
    // ...
]);
```

The token selection algorithm:
1. Tokenize the URL into candidate tokens
2. Score each token by its frequency in real-world URLs (lower = better)
3. Skip tokens adjacent to wildcards (`*`) — they don't discriminate
4. Pick the token with the lowest "badness" score
5. Use that token's hash as bucket key

**IC parallel — Order Validation Dispatch:**

Order validation (V2) currently uses a linear `match` on order type. For a relay processing thousands of orders/second from many players, a token-dispatch approach — bucketing validators by a discriminant key (order type + context flags) — avoids evaluating irrelevant validators. The "bad tokens" concept applies: don't bucket by `player_id` alone (too many collisions for popular players), bucket by `(order_type, target_entity_owner)` which is more discriminating.

### Flat-Array Struct-of-Arrays (The `filterData` Pattern)

uBO stores ALL filter state in a single flat `Int32Array` called `filterData`, with manual index management. Each filter "object" is a contiguous slice of this array: `filterData[idata+0]` = filter class ID (`fid`), followed by class-specific fields. Filter "classes" aren't JS classes with object allocation — they're static dispatch tables (`match` on `fid`) over the shared flat array.

```javascript
// Pseudo-structure of filterData:
// [fid, field1, field2, ...]  [fid, field1, ...]  [fid, ...]
//  ^--- filter 0               ^--- filter 1       ^--- filter 2

// "Instantiation" = allocate a slice of the flat array
static fromCompiled(args) {
    const idata = filterDataAllocLen(3);  // reserve 3 slots
    filterData[idata+0] = args[0];        // fid (type tag)
    filterData[idata+1] = args[1];        // pattern index
    filterData[idata+2] = args[2];        // pattern length
    return idata;                          // return index, not object
}
```

References to JS objects (regexes, strings) go in a separate `filterRefs` array, accessed by index from `filterData`. This separation keeps the hot path (integer comparisons) in the flat array and cold data (regex compilation, string extraction) in the reference array.

**Why this matters:** uBO is 10-50x more memory-efficient than Adblock Plus, which allocated one JS object per filter rule. The flat array has:
- Zero GC pressure (no object headers, no reference counting)
- Cache-friendly layout (contiguous memory, linear scan)
- Trivially serializable (one `ArrayBuffer` to save/restore)
- WASM-compatible (flat memory maps directly to WASM linear memory)

**IC parallel — Behavioral Profile Storage:**

This validates IC's Bevy ECS architecture and the D015 efficiency pyramid. For relay-side behavioral analysis, player profiles should be stored in flat `Vec<ProfileEntry>` indexed by player slot, not in `HashMap<PlayerId, Box<PlayerBehaviorProfile>>`. The hot path (EWMA update, threshold comparison) should touch only contiguous cache-friendly data. Cold data (full timing histograms, replay references) should be separate.

### BidiTrie: Compact Trie Pattern Matching

uBO's bidirectional trie (`biditrie.js` / `biditrie.wasm`) stores URL pattern strings with shared prefix/suffix deduplication. The trie is backed by a flat `Int32Array` (same pattern as `filterData`) and the matching loop is compiled to WASM for ~3x speedup over the JS alternative — because uBO runs in a browser where native code isn't available, and WASM is the fastest option in that sandbox. (IC compiles Rust directly to native machine code, which is faster than WASM — the transferable pattern here is the trie data structure and flat-memory layout, not the compilation target.)

Key properties:
- **Bidirectional:** Matches patterns forward (prefix) and backward (suffix) simultaneously
- **Flat memory:** Trie nodes are array indices, not pointers — cache-friendly, GC-free
- **Selective hot-path compilation:** uBO compiles only the innermost matching loop to WASM while the orchestration stays in JS. The architectural lesson (isolate the hot loop from the orchestration layer) transfers to any language — in Rust, this means keeping the hot trie-traversal loop free of allocations, trait objects, or dynamic dispatch.
- **Separately optimized hostname trie:** `hntrie.js` / `hntrie.wasm` is a separate trie optimized for hostname matching (reversed domain matching: `com.example.ads` stored as `sda.elpmaxe.moc`). Different access pattern, different data structure.

**IC parallel — Cheat Signature Matching:**

The "Kaladin" behavioral pattern-matching model (V12) needs to match observed input patterns against known cheat signatures. A trie-like structure indexed by quantized timing intervals (e.g., inter-order delay buckets: 0-10ms, 10-50ms, 50-100ms, 100-500ms, 500ms+) could match order-timing sequences against known bot profiles more efficiently than the current linear-scan approach. In native relay deployments this is pure Rust; WASM is only relevant if we need this matcher to run in a browser-hosted relay (portability, not acceleration).

### Allow/Block Priority System (Realm-Based Evaluation)

uBO implements a three-tier priority system:
1. `BLOCK_REALM` — default block rules
2. `ALLOW_REALM` — exception rules (prefixed with `@@`)
3. `BLOCKIMPORTANT_REALM` — override rules that defeat exceptions

Evaluation order: check block → check allow (to see if exception exists) → check block-important (to see if exception is itself overridden). This priority cascade is evaluated using bitwise realm flags, not if-else chains.

```javascript
// Bit-packed realm evaluation from static-net-filtering.js
const r = this.realmMatchString(BLOCK_REALM, typeBits, partyBits);
if ( r || (modifiers & 0b0010) !== 0 ) {
    if ( $isBlockImportant !== true ) {
        if ( this.realmMatchString(ALLOW_REALM, typeBits, partyBits) ) {
            return 1;  // allowed (exception matched)
        }
        return 2;  // blocked
    }
    // block-important overrides the exception
}
```

**IC parallel — Order Validation with Override Layers:**

IC's order validation is currently binary (Valid/Rejected). But modded game modes, tournament rules, and admin overrides will need layered priority:
- **Default rules** reject invalid orders (sim validation, D012)
- **Mod rules** may allow orders the default system rejects (custom game modes with different prerequisites)
- **Tournament rules** may reject orders the mod system allows (banned units/strategies)

A realm-based priority system (default → mod-exception → tournament-override) — evaluated via packed bit flags — would be cleaner and faster than chaining if-else validation passes.

## Community Filter Lists: Trust-Tiered Rule Distribution

uBO's most important design is arguably not the matching engine but the **community list infrastructure**:

### List Trust Tiers

1. **Built-in default lists** (EasyList, EasyPrivacy, Peter Lowe's, uBO filters) — enabled by default, maintained by trusted teams with long track records
2. **Available third-party lists** — curated directory of community lists, opt-in, varying quality
3. **User-defined filters** — highest priority, local to the user
4. **Dynamic rules** — runtime overrides via point-and-click UI

### List Composition

Multiple lists merge at compile time. Conflicts are resolved by priority:
- User filters > Dynamic rules > Block-important > Allow > Block
- Within the same priority: later list wins (order-dependent)

### Community Maintenance

The filter lists (hosted at https://github.com/uBlockOrigin/uAssets) are the real product. The engine is "just" the runtime. Key properties:
- **Open contribution:** Anyone can submit filter rules via PR
- **Review process:** Maintainers review for correctness, false positives, and performance impact
- **Rapid iteration:** New ad/tracking patterns are identified and blocked within hours
- **Distribution:** Periodic updates fetched by the extension, compiled locally

### IC Parallel — Community-Maintained Anti-Cheat & Moderation Rules

This maps to two IC systems:

**1. Workshop Content Moderation Rules (D030):**

IC's Workshop could support community-maintained "content safety lists" — analogous to EasyList but for mod content. Rules like "reject packages containing known malware signatures," "flag packages that request network access for the first time," or "warn on packages from authors with <10 total downloads." These rules would be:
- **Tiered:** Official IC rules (built-in), community tournament rules (opt-in), server operator rules (local)
- **Composable:** Multiple rule sets merge with priority (operator > tournament > official)
- **Community-maintained:** Tournament organizers maintain rules for their competitive environment
- **Compiled at load time:** Rules are compiled into an efficient matcher when the relay/Workshop server starts, not interpreted per-request

**2. Anti-Cheat Signature Distribution (V12 Behavioral Analysis):**

Community-maintained cheat signature databases, distributed through the Workshop or a dedicated channel, analogous to uBO's filter list updates. Tournament communities would maintain signature lists for known automation tools, distributed to relay servers that subscribe. The compilation/runtime split (uBO's "static" vs. "dynamic" terminology) maps to:
- **Compiled signatures:** Community-published cheat patterns, validated and compiled into the relay's behavioral matcher at startup
- **Dynamic rules:** Server admin rules that take effect immediately (e.g., "flag player X for investigation")

## Performance Lessons

### Benchmark-Driven Optimization

uBO maintains a `badTokens` frequency table derived from empirical benchmarking against 200K+ real URLs. This data-driven approach to token selection — not guessing which tokens are common, but measuring — is directly applicable to IC's relay optimization. Profile real game order distributions before choosing dispatch keys.

### Hot-Path Isolation (uBO's "Selective WASM" Pattern)

uBO doesn't compile the entire engine to WASM — only the innermost matching loops (`biditrie` character matching, `hntrie` hostname lookup). The orchestration layer (filter selection, bucket dispatch, logging) remains in JS. This selective compilation maximizes the ratio of speedup to implementation complexity.

**Important context for IC:** uBO gains speed from WASM because its baseline is JavaScript. IC is native Rust compiled directly to machine code, which is *faster* than WASM. Compiling Rust to WASM would be a portability/sandboxing choice, never a performance optimization. The transferable lesson is **architectural, not technological:** isolate the innermost hot loop from the orchestration layer, keep it allocation-free and branchless where possible, and make it a self-contained unit that can be independently optimized (or, in the browser target, compiled to WASM without dragging in the entire system).

### Compilation/Runtime Split

"Static" filters must be batch-compiled before use (high memory churn during compilation, zero allocation during matching). "Dynamic" rules take effect immediately with minimal overhead. This duality is key to supporting both large community-maintained rule sets (compiled) and operator overrides (dynamic).

For IC: Workshop anti-cheat rules and behavioral signatures should follow this split. Community rule sets are compiled at relay startup (expensive but amortized). Admin actions (flag player, adjust threshold) are dynamic (immediate, cheap).

## What's NOT Transferable

- **Cosmetic filtering** (DOM element hiding) — web-specific, no RTS parallel
- **CSP/permissions header manipulation** — HTTP-specific
- **MV3/DNR conversion layer** — browser extension API constraints
- **First-party/third-party origin classification** — web origin model doesn't map to RTS
- **Ad-specific heuristics** — tracking pixel detection, etc.

## Summary: Transferable Patterns

| uBO Pattern                                | IC Application                                          | IC System                  |
| ------------------------------------------ | ------------------------------------------------------- | -------------------------- |
| Token-dispatch fast-path matching          | Order validation bucket dispatch                        | V2 (Order Injection), D012 |
| Flat-array struct-of-arrays layout         | Behavioral profile & relay hot-path storage             | V12, D015 (Performance)    |
| BidiTrie compact trie matching             | Cheat signature matching in behavioral analysis         | V12 (Kaladin pattern)      |
| Community filter lists with trust tiers    | Workshop anti-cheat rule distribution                   | V18/V19 + D030             |
| Three-layer cheapest-first evaluation      | Reinforce existing three-layer rate control ordering    | V17 (State Saturation)     |
| Allow/block/block-important priority chain | Order validation with mod/tournament overrides          | V2, D028 (Conditions)      |
| Hot-path isolation (sandbox/portability)   | Browser relay portability; WASM mod sandboxing (D005)   | D005, ic-net               |
| Compilation/runtime rule split             | Community rules (compiled) vs. admin rules (dynamic)    | D030, V12, relay ops       |
| Empirical "bad token" frequency tables     | Data-driven dispatch key selection for order validation | V2, relay optimization     |

## References

- uBlock Origin repository: https://github.com/gorhill/uBlock (GPL-3.0)
- Filter list assets: https://github.com/uBlockOrigin/uAssets
- Static net filtering engine: `src/js/static-net-filtering.js` (~6K lines, core matching)
- BidiTrie implementation: `src/js/biditrie.js` + `src/lib/biditrie/` (WASM)
- HNTrie implementation: `src/js/hntrie.js` + `src/lib/hntrie/` (WASM)
- Filtering context: `src/js/filtering-context.js`
- Static filter syntax documentation: https://github.com/gorhill/uBlock/wiki/Static-filter-syntax
