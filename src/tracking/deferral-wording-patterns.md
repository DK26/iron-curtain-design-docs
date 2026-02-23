# Deferral Wording Patterns (Canonical Replacements)

Keywords: planned deferral wording, future language rewrite, north star wording, proposal-only wording, pending decision wording, vague future replacement

> Use this page to rewrite ambiguous future/deferred wording into explicit planning language that matches the execution overlay (`M0-M11`) and priority system (`P-*`).

## Purpose

- Provide consistent replacements for vague phrases like "could add later" and "future convenience"
- Reduce prose drift across decisions, roadmap notes, README claims, and tracker pages
- Make deferrals implementation-plannable instead of interpretive

## Quick Rule

- The word `future` is allowed.
- **Unplaced future intent is not.**

If the sentence implies work, it must be one of:

- `PlannedDeferral`
- `NorthStarVision`
- `VersioningEvolution`
- proposal-only / `Pxxx`

## Compact Replacement Template (Planned Deferral)

Use this pattern when deferring accepted work in canonical docs:

- **Deferred to:** `M#` / Phase
- **Priority:** `P-*`
- **Depends on:** `...`
- **Reason:** `...`
- **Not in current scope:** `...`
- **Validation trigger:** `...`

## Banned Vague Patterns (Canonical Docs)

These are not allowed unless immediately resolved in the same sentence with milestone/priority/deps and scope boundaries:

- `future convenience`
- `later maybe`
- `could add later`
- `might add later`
- `eventually` (as a planning statement)
- `nice-to-have` (without explicit phase/milestone and optionality)
- `deferred` (without "to what" + "why")

## Pattern Conversions (Good / Bad)

### 1. Vague deferral -> Planned deferral

**Bad**

```md
A manual AI personality editor is a future nice-to-have.
```

**Good**

```md
Deferred to `M10` (`P-Creator`) after `M9.SDK.D038_SCENARIO_EDITOR_CORE`; reason: `M9` focuses on scenario/editor core and validation stability. Not part of `M9` exit criteria. Validation trigger: creator playtests show demand for manual AI profile authoring beyond automated extraction.
```

### 2. Vague technical evolution -> Versioning evolution

**Bad**

```md
We may later change the signature format.
```

**Good**

```md
Current default is Signature Format `v1`. A `v2` format may be introduced only with explicit migration semantics (`v1` verification remains supported for legacy packages) and version dispatch at package load/verification boundaries.
```

### 3. Marketing overpromise -> North Star vision

**Bad**

```md
Players will be able to play fully fair ranked matches against any client in 2D or 3D.
```

**Good**

```md
Long-term vision (North Star): mixed-client battles across visual styles (e.g., classic 2D and IC 3D presentation) with trust labels and fairness-preserving rules. This depends on `M7.NET.CROSS_ENGINE_BRIDGE_AND_TRUST` + `M11.VISUAL.D048_AND_RENDER_MOD_INFRA` and is not a blanket ranked guarantee.
```

### 4. Unplaceable idea -> Proposal-only

**Bad**

```md
Could add a community diplomacy system later.
```

**Good**

```md
Proposal-only (not scheduled): community diplomacy system concept. No milestone placement yet; raise a `Pxxx` pending decision if adopted for planning.
```

### 5. Missing dependency detail -> Complete planned deferral

**Bad**

```md
Deferred to a later phase.
```

**Good**

```md
Deferred to `M11` (`P-Optional`) after `M7` community trust infrastructure and `M10` creator/platform baseline. Reason: governance/polish feature, not on the core runtime path. Not in `M7-M10` exit criteria. Validation trigger: post-launch moderation workload shows clear need and a non-disruptive UI path.
```

## Repo-Specific Examples (IC)

### D070 optional modes and extensions

Use when a game mode/pacing layer is experimental:

```md
Deferred to `M10` (`P-Optional`) as a D070 experimental extension after the `Commander & SpecOps` template toolkit is validated. Not part of the base D070 mode acceptance criteria. Validation trigger: prototype playtests demonstrate low role-overload and positive pacing metrics.
```

### SDK/editor convenience layers

Use when the runtime path already supports the capability but the editor convenience UX is extra:

```md
Deferred to `M10` (`P-Creator`) after `M9` editor core and asset workflow stabilization. Reason: convenience layer depends on stable content schemas and validated authoring UI patterns. Not in `M9` exit criteria.
```

### Cross-engine mixed-visual claims

Use in README / public docs:

```md
North Star vision only: mixed-client 2D-vs-3D battles with trust labels and fairness-preserving rules. Depends on cross-engine bridge trust (`M7`) and visual/render mode infrastructure (`M11`); mode-specific fairness claims apply.
```

## Decision / Feature Update Checklist (Wording)

Before finalizing a doc change that includes future-facing language:

1. Is this accepted work or only an idea?
2. If accepted, did you assign milestone + priority + dependency placement?
3. Did you mark out-of-scope boundaries for the current milestone?
4. Did you define a validation trigger for promoting the deferral?
5. Did you update the execution overlay and `future-language-audit.md` in the same change?

## Related Pages

- [`future-language-audit.md`](future-language-audit.md)
- [`milestone-dependency-map.md`](milestone-dependency-map.md)
- [`../18-PROJECT-TRACKER.md`](../18-PROJECT-TRACKER.md)
- [`../14-METHODOLOGY.md`](../14-METHODOLOGY.md)
- `AGENTS.md` (repository root; operational policy for agents)
