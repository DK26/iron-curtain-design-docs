# Installation & First-Run Setup Wizard UX Analysis — Research Workstream

> **Purpose:** Study how other platforms/apps handle installation, setup, repair, and first-run onboarding so IC's D069 installation/setup wizard leans toward strong UX patterns and avoids common failures.
>
> **Status:** Research plan / scaffold (to be filled with concrete source reviews)
>
> **Related decisions:** D069 (Installation & First-Run Setup Wizard), D061 (Data & Backup), D068 (Selective Installation), D030/D049 (Workshop transport & verification), D065 (Onboarding handoff)

---

## Scope

This note evaluates installation/setup UX patterns that matter to IC:

1. **Binary install vs in-app setup split**
2. **First-run setup sequencing** (identity, content detection, optional downloads, onboarding handoff)
3. **Selective install/component selection UX**
4. **Repair / verify / re-scan / reclaim-space workflows**
5. **Progress/error handling and resumability**
6. **Offline-first and no-dead-end behavior**

This is **not**:
- a packaging implementation spec (`MSI`, `DMG`, `AppImage`, etc.)
- a legal/compliance checklist for app stores or console certification
- a replacement for platform SDK/API docs

---

## Research Questions (Decision-Shaping)

1. What should IC keep in platform-native installers versus the in-app D069 setup wizard?
2. What progress UI and error-recovery patterns reduce abandonment during large content installs?
3. How do good products expose "Quick" vs "Advanced" setup without scaring new users?
4. How do strong repair/verify flows present binary verification vs content verification clearly?
5. Which patterns create "launcher bloat" or duplicate platform responsibilities and should be avoided?

---

## Candidate Sources to Review

### Game / Platform Ecosystems

- Steam install/update/verify flows (client + per-game "verify integrity" UX)
- GOG Galaxy install/repair flows
- Battle.net install/update/scan & repair
- EA App / Origin install/repair UX
- C&C Remastered launcher/setup surfaces (where applicable)
- OpenRA first-run/mod/resource acquisition flows

### Cross-Platform Desktop Apps (Installer + Repair UX)

- VS Code
- Firefox
- Discord
- Steam Deck-native apps / handheld-first setup flows (where relevant)

### Mod/Community Tooling (Selective Installs / Repair)

- Mod managers with verify/reinstall/repair semantics
- Game launchers with component-based installs (campaign/HD packs/languages)

---

## Method (Use D014 Methodology "Trend Scan Checklist" Style)

For each source, capture:

- **What is the source?** (primary docs, official client behavior, community reports)
- **What problem is it solving?**
- **What works well?** (Fit)
- **What creates friction or distrust?** (Risk)
- **What should IC adopt / adapt / reject?** (IC Action)

Use the standard matrix:

- **Fit**
- **Risk**
- **IC Action**

Also record explicit:
- **Lean toward**
- **Avoid**

---

## Evaluation Template (Per Source)

### Source: `<product / flow>`

- **Source type:** primary / secondary / community feedback
- **What was inspected:** install flow / repair flow / first-run / component selection / error recovery

**Observed strengths**
- ...

**Observed weaknesses / friction**
- ...

**Fit / Risk / IC Action**
- **Fit:** ...
- **Risk:** ...
- **IC Action:** ...

**Notes for D069**
- Binary install responsibility split:
- First-run wizard sequencing:
- Repair/verify UI:
- Progress/error messaging:

---

## IC-Specific Synthesis (To Fill After Reviews)

### Lean Toward (Candidate patterns)

- Platform-native binary install/update + IC-owned first-run setup wizard
- Quick vs Advanced setup split with clear reversibility
- Presets with size estimates + feature summaries
- Resumable setup and maintenance/repair re-entry
- Source detection with confidence/status and direct remediation

### Avoid (Candidate anti-patterns)

- Mandatory online sign-in before local play
- Duplicate platform patchers
- Hidden optional downloads / dark patterns
- Irreversible setup choices
- Path-heavy raw filesystem UX as the primary flow on constrained platforms

---

## Planned Outputs Back Into Docs

When this note is completed, propagate concrete updates to:

- `src/decisions/09g-interaction.md` (D069 copy/error-state refinements)
- `src/17-PLAYER-FLOW.md` (wizard screen wording and maintenance flow details)
- `src/decisions/09e-community.md` (transport/repair UX clarifications if needed)
- `src/decisions/09c-modding.md` (D068 install preset presentation guidance if needed)

---

## Acceptance Criteria for This Research Note (Completion Definition)

- At least one source reviewed for each category:
  - game/store ecosystem
  - RTS/community tooling
  - cross-platform desktop app
- Each source has a **Fit / Risk / IC Action** summary
- Explicit "Lean Toward" and "Avoid" lists updated with evidence
- D069/D068/Player Flow doc refinements identified (or confirmed unnecessary)

