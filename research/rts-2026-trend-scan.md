# RTS 2026 Trend Scan (YouTube Listicle) — Confirmatory Research

> **Purpose:** Extract trend signals and feature inspiration from a contemporary RTS roundup video and evaluate them against IC's philosophy and methodology. Convert "cool ideas" into a **Fit / Risk / IC Action** matrix instead of ad hoc feature creep.
>
> **Date:** 2026-02-22
> **Status:** Confirmatory research (inspiration filtering, not a source of truth for technical claims)

---

## Scope

This note answers one narrow question:

1. Which ideas/themes from a 2026 RTS trend roundup are worth borrowing for IC, **if and only if** they fit IC's design philosophy (community-first, reversible experiments, layered complexity, no unnecessary parallel systems)?

This is **not**:
- a technical implementation review of the featured games
- a market forecast
- a replacement for code-level or issue-tracker research

This is a **trend scan** used as an inspiration filter.

---

## Source Reviewed

### Primary Source

- YouTube video: **"The RTS Comeback is HERE: 15 Most Anticipated Games of 2026!"** (IndieCrawler)
  - <https://www.youtube.com/watch?v=WPGocP3KYj0>

### Retrieval Method (for reproducibility)

- Video title verified via YouTube oEmbed endpoint
- English transcript/captions fetched using `youtube-transcript-api`
- Analysis performed on the transcript text (`/tmp/WPGocP3KYj0.transcript.txt`) during review

> Note: This is a **secondary commentary source** (a listicle). It is useful for identifying recurring *design themes* and *player expectations*, but not for validating implementation claims. IC decisions should still be grounded in primary sources (official docs, code, empirical testing, community pain points).

---

## Why This Is Relevant to IC (Methodology Fit)

IC's methodology explicitly treats research as a **continuous discipline** and encourages confirmatory prior-art reviews when they produce actionable refinements.

This trend scan is useful because it surfaces what the RTS audience is currently excited about in 2026:
- campaign depth
- co-op/PvE/competitive mode breadth
- scale and spectacle
- hybrid campaign/meta layers
- strong faction identity

These are exactly the kinds of signals that help IC decide **what to package as optional templates/modes** versus what must remain core and simple.

---

## Summary of Signals in the Video (High-Level)

Across the featured games, the recurring themes were:

- **Campaign depth and nonlinear progression** (dynamic maps, branching/nonlinear campaigns)
- **Mode breadth** (single-player + co-op/PvE + competitive/ranked)
- **Hero/mercenary/personality layers** in some RTS designs
- **Large-scale spectacle** (vast armies, zoomed-out command, titan units)
- **Dynamic environments / terrain / weather manipulation**
- **Genre fusion ambition** (RTS + grand strategy / RPG / city-builder)
- **Strong visual identity and thematic differentiation**

The video also repeatedly acknowledges the risk of:
- **over-scoping**
- **genre pileups becoming unfocused**
- projects trying to do everything at once

That caution is highly consistent with IC's philosophy and methodology.

---

## Fit / Risk / IC Action Matrix

## 1. Dynamic / Persistent Meta-Map Campaign Layers

**Signal from video:** Several titles emphasize dynamic or persistent world/galactic campaign maps and nonlinear progression.

**Fit with IC:** **High**
- IC already supports D021 branching campaigns and D038 world-map intermissions
- IC already has optional strategic/generative directions (D016)

**Risk:**
- turning every campaign into a strategic meta-layer
- confusing "RA-style branch select" with "full grand strategy mode"
- scope creep in campaign tooling UX

**IC action (recommended):**
- Keep this as **optional campaign mode templates**, not a universal campaign requirement
- Preserve the hierarchy:
  - `RA-style globe branch select` (simple)
  - `world-map progress presentation` (medium)
  - `world domination / strategic layer` (advanced)
- Label early variants as experimental if needed (D033/D019 style reversibility mindset)

**Docs already aligned with this direction:**
- `src/decisions/09f-tools.md` (Campaign Editor + World Map intermissions)
- `src/modding/campaigns.md` (D021 campaign graph/persistent state)

---

## 2. Hero / Mercenary Layers in RTS Campaigns

**Signal from video:** Hero-heavy RTS structures (factions + heroes/mercs, RPG-lite layers) are part of current genre interest.

**Fit with IC:** **High**
- IC now explicitly supports optional hero campaigns via D021 + D038 hero toolkit
- Fits named characters, inventory, intermissions, branching dialogue

**Risk:**
- accidentally making hero mechanics part of the default RA/TD experience
- overbuilding custom hero UI before validating creator demand

**IC action (recommended):**
- Keep hero progression as an **optional campaign authoring layer**
- Ship common cases as built-in YAML/SDK tooling
- Reserve Lua/WASM for bespoke systems
- Surface export fidelity warnings (IC-native feature)

**Docs already aligned with this direction:**
- `src/modding/campaigns.md` (hero toolkit, Tanya skill-tree example)
- `src/decisions/09f-tools.md` (hero progression authoring + scenario trigger hooks)
- `src/17-PLAYER-FLOW.md` (Hero Sheet / Skill Choice intermission/editor mocks)

---

## 3. "Complete Package" Expectations (Campaign + Co-op + Competitive)

**Signal from video:** Modern RTS excitement clusters around games that promise more than a single lane (campaign only or PvP only).

**Fit with IC:** **High**
- IC already aims for campaign, skirmish, multiplayer, workshop, replay support
- IC philosophy is community-first: support the real ways people play, not just one ideal mode

**Risk:**
- front-loading too many surfaces into the default UX
- adding complexity that "stands in the way" of just playing

**IC action (recommended):**
- Keep the **simple primary flow** intact
- Use layered complexity:
  - player mode entry points stay clean
  - advanced tools/features live in Advanced mode / optional panels
- Continue using "no dead-end buttons" and install-on-demand flows (D068)

---

## 4. Dynamic Terrain / Weather / Environmental Spectacle

**Signal from video:** Terrain deformation/manipulation and weather-driven tactical moments are exciting differentiators.

**Fit with IC:** **Medium to High**
- IC already has dynamic weather and terrain-surface state (D022)
- Spectacle and authored mission moments fit IC well

**Risk:**
- performance regressions on low-end hardware
- adding simulation complexity that harms determinism/debuggability
- turning every map into a gimmick showcase

**IC action (recommended):**
- Prefer **authored mission moments** and **module-gated mechanics**
- Keep simulation effects optional and deterministic
- Treat high-spectacle effects as presentation-tier features with graceful fallback on baseline hardware

**Docs already aligned with this direction:**
- `src/decisions/09f-tools.md` (weather modules, cinematic tooling)
- `src/10-PERFORMANCE.md` (low-end and optional advanced visuals)

---

## 5. Genre Fusion (RTS + Grand Strategy / City Builder / RPG / Tactical Wargame)

**Signal from video:** Strong appetite exists for hybrid designs, but the video itself frequently warns about execution risk.

**Fit with IC:** **Medium (only as optional modes/modules)**
- IC's modular architecture can host experiments safely
- IC philosophy explicitly warns against irreversible compromises and scope confusion

**Risk (highest in this list):**
- "everything everywhere all at once" design
- losing focus on the C&C/OpenRA community pain points
- creating parallel systems instead of extending existing ones

**IC action (recommended):**
- Treat hybrid concepts as:
  - **campaign templates**
  - **game mode templates**
  - **modder-facing modules**
- Do **not** reframe the core product identity around a hybrid experiment
- Require explicit phase labels and reversibility if introduced early

**Philosophy/methodology anchors:**
- community pain points first
- reversible compromises / toggles
- alternatives + rationale

---

## 6. Large-Scale Spectacle and Extreme Unit Counts

**Signal from video:** "Epic scale" and "massive armies" remain highly attractive.

**Fit with IC:** **Medium to High**
- IC performance philosophy explicitly targets large counts on modest hardware
- IC pathfinding/perf work supports scale as a legitimate goal

**Risk:**
- sacrificing readability and control precision for raw scale marketing
- drifting from low-end hardware support

**IC action (recommended):**
- Keep scale as a **supported envelope**, not a mandatory baseline experience
- Continue prioritizing readability, command clarity, and performance determinism over spectacle-only features
- Use scenario templates and campaign pacing to vary scale (not every mission is a giant battle)

---

## 7. Strong Thematic Identity / Visual Differentiation

**Signal from video:** Distinct art direction and tone stand out in a crowded RTS field.

**Fit with IC:** **High**
- IC can preserve classic RA identity while allowing bold module/mod themes
- D032 themes + D040 asset tooling + D038 media/cinematics are strong enablers

**Risk:**
- generic "modern RTS" visual homogenization in UI/themes
- over-indexing on aesthetics without gameplay clarity

**IC action (recommended):**
- Encourage strong visual directions in modules/mods, but preserve readability and faction clarity
- Keep theme and layout profile separation (especially across desktop/mobile)
- Use publish readiness / quality checks for accessibility/readability risks

---

## What This Video Reinforces About IC Philosophy (Positive Confirmation)

## 1. IC's "Modular Optionality" Is the Right Response to Trend Volatility

The video showcases many ambitious directions, but not all of them will land. IC's architecture and design methodology are well-positioned because they allow:
- optional modes
- presets/toggles
- module-specific experimentation
- creator-led extensions via SDK/modding

This avoids locking IC's identity to one speculative trend.

## 2. Scope Discipline Is a Competitive Advantage

The video repeatedly calls out scope risk in hybrid games. IC's insistence on:
- canonical decisions
- alternatives/rationale
- cross-cutting propagation
- reversible compromises

is not bureaucracy; it's protection against exactly the failure mode the video warns about.

## 3. Player-Facing Simplicity Still Matters

Even when feature breadth increases, the user still wants a clean way to:
- start a campaign
- start a match
- understand what's happening
- avoid UI friction

This validates IC's layered-complexity and "don't stand in the way" direction in both game UX and SDK UX.

---

## Candidate Follow-Ups (Not Commitments)

> These are **candidate ideas** derived from a single secondary source. They require validation against additional sources and maintainer review before becoming design decisions or roadmap items.

1. **Candidate:** Expand D038 **game mode / campaign templates** with clearly labeled optional patterns. Example names (placeholder, not final):
   - `Hero Ops` (hero-progression campaign)
   - `Persistent War Map Lite` (world map presentation + branching)
   - `Co-op Survival / Last Stand`
   - `Tactical Ops (No Base Building)`

2. **Candidate:** Add a lightweight **"experimental template" labeling policy** to D038/D033 docs:
   - explicit label
   - compatibility/export notes
   - phase / maturity status

3. **Adopted:** Trend-scan checklist for future inspiration reviews (see `src/14-METHODOLOGY.md` § "Trend Scan Checklist"):
   - player problem solved?
   - fits invariants?
   - optional layer vs core change?
   - reversible?
   - export/fidelity impact?
   - low-end performance impact?

---

## Limits / Caveats

- This is a **trend signal** document, not a technical verification source.
- The video is a curated listicle and may over-index on hype/marketing promises.
- Any feature inspired by these trends still requires:
  - community pain-point justification
  - architectural fit review
  - decision entry (or revision note)
  - real user testing

---

## Cross-References (IC Docs)

- `src/13-PHILOSOPHY.md` (community-first, reversible compromises, layered UX values)
- `src/14-METHODOLOGY.md` (continuous research, alternatives+rationale, propagation discipline)
- `src/decisions/09f-tools.md` (campaign editor, templates, intermissions, scenario tooling)
- `src/modding/campaigns.md` (D021 campaign graph and persistent state)
- `src/17-PLAYER-FLOW.md` (player-facing and SDK UX surfaces)
- `src/08-ROADMAP.md` (phase placement for optional advanced features)

