## D051: Engine License — GPL v3 with Explicit Modding Exception

**Decision:** The Iron Curtain engine is licensed under **GNU General Public License v3.0** (GPL v3) with an explicit **modding exception** that clarifies mods loaded through the engine's data and scripting interfaces are NOT derivative works.

**Rationale:**

1. **The C&C open-source community is a GPL community.** EA released every C&C source code drop under GPL v3 — Red Alert, Tiberian Dawn, Generals/Zero Hour, and the Remastered Collection engine. OpenRA uses GPL v3. Stratagus uses GPL-2.0. Spring Engine uses GPL-2.0. The community this project is built for lives in GPL-land. GPL v3 is the license they know, trust, and expect.

2. **Legal compatibility with EA source.** `ra-formats` directly references EA's GPL v3 source code for struct definitions, compression algorithms, and lookup tables (see `formats/binary-codecs.md` § Binary Format Codec Reference). GPL v3 for the engine is the cleanest legal path — no license compatibility analysis required.

3. **The engine stays open — forever.** GPL guarantees that no one can fork the engine, close-source it, and compete with the community's own project. For a community that has watched proprietary decisions kill or fragment C&C projects over three decades, this guarantee matters. MIT/Apache would allow exactly the kind of proprietary fork the community fears.

4. **Contributor alignment.** DCO + GPL v3 is the combination used by the Linux kernel — the most successful community-developed project in history. OpenRA contributors moving to IC (or contributing to both) face zero license friction.

5. **Modders are NOT restricted.** This is the key concern the old tension analysis raised, and IC's intended interpretation is clear: YAML data files, Lua scripts, and WASM modules loaded through a sandboxed runtime interface are NOT derivative works under GPL. This interpretation follows the same principle as these well-known precedents:
   - Linux kernel (GPL) + userspace programs (any license)
   - Blender (GPL) + Python scripts (any license)
   - WordPress (GPL) + themes and plugins loaded via defined APIs (debated, but widely practiced)
   - GCC (GPL) + programs compiled by GCC (any license, via explicit runtime library exception)

   IC's tiered modding architecture (D003/D004/D005) was specifically designed so that mods operate through data interfaces and sandboxed runtimes rather than linking against engine internals. The explicit § 7 modding exception removes ambiguity about IC's intent.

6. **Commercial use is allowed.** GPL v3 permits selling copies, hosting commercial servers, running tournaments with prize pools, and charging for relay hosting. It requires sharing source modifications — which is exactly what this community wants.

**The modding exception (added to LICENSE header):**

```
Additional permission under GNU GPL version 3 section 7:

If you modify this Program or any covered work, by linking or combining
it with content loaded through the engine's data interfaces (YAML rule
files, Lua scripts, WASM modules, resource packs, Workshop packages, or
any content loaded through the modding tiers described in the
documentation as "Tier 1", "Tier 2", or "Tier 3"), the content loaded
through those interfaces is NOT considered part of the covered work and
is NOT subject to the terms of this License. Authors of such content may
choose any license they wish.

This exception does not affect the copyleft requirement for modifications
to the engine source code itself.
```

This exception uses GPL v3 § 7's "additional permissions" mechanism — the same mechanism GCC uses for its runtime library exception. It is legally sound and well-precedented.

### Why the Modding Exception Survives Combination with EA's GPL Code

A natural concern: EA released their C&C source under vanilla GPL v3 (no additional permissions). `ra-formats` derives from that code. Does EA's GPL "override" or "infect" IC's modding exception?

**IC's position is no.** GPL v3 § 7 describes how additional permissions work in combined works, and IC's reading is:

1. **Additional permissions apply to the portions you hold copyright over.** The modding exception covers IC's data interfaces — the YAML loader, Lua sandbox, WASM runtime, asset pipeline. EA never wrote any of these. They are entirely IC's original code.

2. **EA-derived code stays vanilla GPL.** The struct definitions, compression tables, and lookup tables in `ra-formats` that reference EA's source remain under vanilla GPL v3. The modding exception doesn't apply to that code — and in IC's intended architecture, mods interact through sandboxed interfaces rather than format parsing internals.

3. **Mods interact through IC's interfaces, not EA's code.** A YAML rule file that defines a unit doesn't touch `ShapeBlock_Type` or LCW compression. The engine loads the `.shp` file, decodes it, and hands the mod runtime values (sprites, stats). The mod operates on the output of the engine's pipeline — analogous to a Linux userspace program reading files via syscalls.

4. **Downstream redistributors can remove additional permissions (§ 7 ¶ 4), but cannot add restrictions.** Someone who forks IC can strip the modding exception from *their* fork — but they still get the vanilla GPL's data interface interpretation. And IC's own distribution retains the exception.

**Precedent chain:**
- **GCC runtime library exception:** GCC (GPL) compiles programs that link against libgcc (GPL + exception). The exception covers GCC's own runtime support code. Third-party GPL libraries included in the compilation don't nullify the exception on GCC's portions.
- **Linux kernel:** GPL kernel + proprietary NVIDIA drivers communicating through defined interfaces. Controversial, but the interface boundary is the same principle IC's modding tiers use.
- **WordPress:** GPL core + themes/plugins loaded via defined hooks. Whether WordPress themes are derivative works remains debated, but the interface-boundary principle is the same one IC relies on — and IC's explicit § 7 exception resolves the ambiguity that WordPress lacks.

### GPL Is a Policy Choice, Not a Technical Necessity

IC does not *technically depend* on any EA GPL code to function. The GPL dependency is a deliberate community alignment decision.

**What EA's GPL source provides to `ra-formats`:**
- Struct layout definitions (`ShapeBlock_Type`, `AUDHeaderType`, etc.)
- LCW compression tables
- IMA ADPCM lookup tables (`IndexTable`/`DiffTable`)
- MIX archive CRC hash algorithm (rotate-left-1 + add)
- VQA chunk structure definitions

**Every one of these is independently documented** by the community (XCC Utilities, ModEnc wiki, OpenRA source, community format specifications) and has been for 20+ years. IMA ADPCM is an industry standard with a public specification — it is not EA-proprietary.

`cnc-formats` (D076, MIT/Apache-2.0) proves the point: it implements identical parsers for all C&C formats — binary codecs (`.mix`, `.shp`, `.pal`, `.aud`, `.tmp`, `.vqa`, `.wsa`, `.fnt`), `.ini` rules, and feature-gated MiniYAML — using only community documentation and public specifications, with zero EA-derived code. The engine runs correctly with `cnc-formats` alone.

`ra-formats` adds EA-derived details for **authoritative correctness** — when community docs and the original source disagree on edge cases (corrupt files, undocumented flags, rare compression modes), the original source is the ground truth. This is a quality choice, not a functional dependency.

**Consequence:** If the GPL ever became problematic (hypothetically — a legal landscape change, community preference shift, or strategic pivot), the *technical* path exists:
1. Drop `ra-formats`'s EA-derived code and rely solely on `cnc-formats`'s clean-room parsers
2. Relicense the engine crates (which contain zero EA code) — subject to consent from all copyright holders under the DCO, which is a practical constraint at scale
3. The standalone crates (D076) are already MIT/Apache-2.0 and require no change

This fallback path exists but is not planned — GPL v3 serves IC's community goals well.

**Alternatives considered:**

- **MIT / Apache 2.0** (rejected — allows proprietary forks that fragment the community; creates legal ambiguity when referencing GPL'd EA source code; the Bevy ecosystem uses MIT/Apache but Bevy is a general-purpose framework, not a community-specific game engine)
- **LGPL** (rejected — complex, poorly understood by non-lawyers, and unnecessary given the explicit modding exception under GPL v3 § 7)
- **Dual license (GPL + commercial)** (rejected — adds complexity with no clear benefit; GPL v3 already permits commercial use)
- **GPL v3 without modding exception** (rejected — would leave legal ambiguity about WASM mods that might be interpreted as derivative works; the explicit exception removes all doubt)

**What this means in practice (IC's intended interpretation — not counsel-reviewed):**

| Activity                                    | Allowed? | Requirement                                              |
| ------------------------------------------- | -------- | -------------------------------------------------------- |
| Play the game                               | Yes      | —                                                        |
| Create YAML/Lua/WASM mods                   | Yes      | Any license you want (modding exception)                 |
| Publish mods on Workshop                    | Yes      | Author chooses license (D030 requires SPDX declaration)  |
| Sell a total conversion mod                 | Yes      | Mod's license is the author's choice                     |
| Fork the engine                             | Yes      | Your fork must also be GPL v3                            |
| Run a commercial server                     | Yes      | If you modify the server code, share those modifications |
| Use IC code in a proprietary game           | No       | Engine modifications must be GPL v3                      |
| Embed IC engine in a closed-source launcher | Yes      | The engine remains GPL v3; the launcher is separate      |

### Phase

Resolved. The LICENSE file ships with the GPL v3 text plus the modding exception header from Phase 0 onward.

### Relationship to D076 (Standalone Crate Extraction)

D076's crate extraction strategy is the structural enforcement of D051's licensing model:

| Layer                                                      | License                    | EA code?                              | Modding exception?                           |
| ---------------------------------------------------------- | -------------------------- | ------------------------------------- | -------------------------------------------- |
| Standalone crates (`cnc-formats`, `fixed-game-math`, etc.) | MIT OR Apache-2.0          | None — clean-room                     | N/A (permissive)                             |
| `ra-formats`                                               | GPL v3 (vanilla)           | Yes — struct defs, compression tables | Not needed (mods don't link against parsers) |
| Engine crates (`ic-sim`, `ic-net`, `ic-game`, etc.)        | GPL v3 + modding exception | None — IC original code               | Yes — covers all data interfaces             |
| Mods (YAML / Lua / WASM)                                   | Author's choice            | None                                  | Protected by exception                       |

The separate-repo-from-inception strategy (D076) is the strongest possible GPL boundary defense: `cnc-formats` was never in a GPL repository, so there is zero GPL contamination argument. The clean-room parsers in `cnc-formats` also serve as proof that the engine is not technically dependent on EA's GPL code — a permissive fallback path exists if ever needed.

### CI Enforcement: cargo-deny for License Compliance

Embark Studios' **cargo-deny** (2,204★, MIT/Apache-2.0) automates license compatibility checking across the entire dependency tree. IC should add `cargo-deny` to CI from Phase 0 with a GPL v3 compatibility allowlist — every `cargo deny check licenses` run verifies that no dependency introduces a license incompatible with GPL v3 (e.g., SSPL, proprietary, GPL-2.0-only without "or later"). For Workshop content (D030), the `spdx` crate (also from Embark, 140★) parses SPDX license expressions from resource manifests, enabling automated compatibility checks at publish time. See `research/embark-studios-rust-gamedev-analysis.md` § cargo-deny.
