## D037: Community Governance & Platform Stewardship

**Decision:** IC's community infrastructure (Workshop, tracking servers, competitive systems) operates under a **transparent governance model** with community representation, clear policies, and distributed authority.

**Rationale:**
- OpenRA's community fragmented partly because governance was opaque — balance changes and feature decisions were made by a small core team without structured community input, leading to the "OpenRA isn't RA1" sentiment
- ArmA's Workshop moderation is perceived as inconsistent — some IP holders get mods removed, others don't, with no clear published policy
- CNCnet succeeds partly because it's community-run with clear ownership
- The Workshop (D030) and competitive systems create platform responsibilities: content moderation, balance curation, server uptime, dispute resolution. These need defined ownership.
- Self-hosting is a first-class use case (D030 federation) — governance must work even when the official infrastructure is one of many

**Key Design Elements:**

### Governance Structure

| Role                          | Responsibility                                                               | Selection                                                    |
| ----------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **Project maintainer(s)**     | Engine code, architecture decisions, release schedule                        | Existing (repository owners)                                 |
| **Workshop moderators**       | Content moderation, DMCA processing, policy enforcement                      | Appointed by maintainers, community nominations              |
| **Competitive committee**     | Ranked map pool, balance preset curation, tournament rules                   | Elected by active ranked players (annual)                    |
| **Game module stewards**      | Per-module balance/content decisions (RA1 steward, TD steward, etc.)         | Appointed by maintainers based on community contributions    |
| **Community representatives** | Advocate for community needs, surface pain points, vote on pending decisions | Elected by community (annual), at least one per major region |

### Transparency Commitments

- **Public decision log** (this document) for all architectural and policy decisions
- **Monthly community reports** for Workshop statistics (uploads, downloads, moderation actions, takedowns)
- **Open moderation log** for Workshop takedown actions (stripped of personal details) — the community can see what was removed and why
- **RFC process for major changes:** Balance preset modifications, Workshop policy changes, and competitive rule changes go through a public comment period before adoption
- **Community surveys** before major decisions that affect gameplay experience (annually at minimum)

### Legacy Freeware / Mirror Rights Policy Gate (D049 / D068 / D069)

The project may choose to host legacy/freeware C&C content mirrors in the Workshop, but this is governed by an explicit **rights-and-provenance policy gate**, not informal assumptions.

Governance requirements:
- published policy defining what may be mirrored (if anything), by whom, and under what rights basis
- provenance labeling and source-of-rights documentation requirements
- update/removal/takedown process (including DMCA handling where applicable)
- clear player messaging distinguishing:
  - local owned-install imports (D069), and
  - Workshop-hosted mirrors (policy-approved only)

This gate exists to prevent "freeware" wording from silently turning into unauthorized redistribution.

### Self-Hosting Independence

The governance model explicitly supports community independence:

- Any community can host their own Workshop server, tracking server, and relay server
- Federation (D030) means community servers are peers, not subordinates to the official infrastructure
- If the official project becomes inactive, the community has all the tools, source code, and infrastructure to continue independently
- Community-hosted servers set their own moderation policies (within the framework of clear minimum standards for federated discovery)

### Community Groups

**Lesson from ArmA/OFP:** The ArmA community's longevity (25+ years) owes much to its clan/unit culture — persistent groups with shared mod lists, server configurations, and identity. IC supports this natively rather than leaving it to Discord servers and spreadsheets.

Community groups are lightweight persistent entities in the Workshop/tracking infrastructure:

| Feature                | Description                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------- |
| **Group identity**     | Name, tag, icon, description — displayed in lobby and in-game alongside player names                     |
| **Shared mod list**    | Group-curated list of Workshop resources. Members click "Sync" to install the group's mod configuration. |
| **Shared server list** | Preferred relay/tracking servers. Members auto-connect to the group's servers.                           |
| **Group achievements** | Community achievements (D036) scoped to group activities — "Play 50 matches with your group"             |
| **Private lobbies**    | Group members can create password-free lobbies visible only to other members                             |

Groups are **not** competitive clans (no group rankings, no group matchmaking). They are social infrastructure — a way for communities of players to share configurations and find each other. Competitive team features (team ratings, team matchmaking) are separate and independent.

**Storage:** Group metadata stored in SQLite (D034) on the tracking/Workshop server. Groups are federated — a group created on a community tracking server is visible to members who have that server in their `settings.toml` sources list. No central authority over group creation.

**Phase:** Phase 5 (alongside multiplayer infrastructure). Minimal viable implementation: group identity + shared mod list + private lobbies. Group achievements and server lists in Phase 6a.

### Community Knowledge Base

**Lesson from ArmA/OFP:** ArmA's community wiki (Community Wiki — formerly BI Wiki) is one of the most comprehensive game modding references ever assembled, entirely community-maintained. OpenRA has scattered documentation across GitHub wiki pages, the OpenRA book, mod docs, and third-party tutorials — no single authoritative reference.

IC ships a structured knowledge base alongside the Workshop:

- **Engine wiki** — community-editable documentation for engine features, YAML schema reference, Lua API reference, WASM host functions. Seeded with auto-generated content from the typed schema (every YAML field and Lua global gets a stub page).
- **Modding tutorials** — structured guides from "first YAML change" through "WASM total conversion." Community members can submit and edit tutorials.
- **Map-making guides** — scenario editor documentation with annotated examples.
- **Community cookbook** — recipe-style pages: "How to add a new unit type," "How to create a branching campaign," "How to publish a resource pack." Short, copy-pasteable, maintained by the community.

**Implementation:** The knowledge base is a static site (mdbook or similar) with source in a public git repository. Community contributions via pull requests — same workflow as code contributions. Auto-generated API reference pages are rebuilt on each engine release. The in-game help system links to knowledge base pages contextually (e.g., the scenario editor's trigger panel links to the triggers documentation).

**Authoring reference manual requirement (editor/SDK, OFP-style discoverability):**

The knowledge base is also the canonical source for a **comprehensive authoring manual** covering what creators can do in the SDK and data/scripting layers. The goal is the same kind of "what is possible?" depth that made Operation Flashpoint/ArmA community documentation so valuable.

Required reference coverage (versioned and searchable):
- **YAML field/flag/parameter reference** — every schema field, accepted values, defaults, ranges, constraints, and deprecation notes
- **Editor feature reference** — every D038 mode/panel/module/trigger/action with usage notes and examples
- **Lua scripting reference** — globals, functions, event hooks, argument types, return values, examples, migration notes (OpenRA aliases + IC extensions)
- **WASM host function reference** (where applicable) with capability/security notes
- **CLI command reference** — every `ic` command/subcommand/flag, examples, and CI/headless notes
- **Cross-links and "see also" paths** between features (e.g., trigger action -> Lua equivalent -> export-safe warning -> tutorial recipe)

**SDK embedding (offline-first, context-sensitive):**
- The SDK ships with an **embedded snapshot** of the authoring manual for offline use
- Context help (`F1`, `?` buttons, right-click "What is this?") deep-links to the relevant page/anchor for the selected field/module/trigger/command
- When online, the SDK may offer a newer docs snapshot or open the web version, but the embedded snapshot remains the baseline
- The embedded view and web knowledge base are the **same source material**, not parallel documentation trees

**Authoring metadata requirement (for generation quality):**
- Editor-visible features (modules, triggers, actions, parameters) should carry doc metadata (`summary`, `description`, `constraints`, `examples`, `since`, `deprecated`) so the manual can be partly auto-generated and remain accurate as features evolve
- This metadata also improves SDK inline help, validation messages, and future LLM/editor-assistant grounding (D057)

**Not a forum.** The knowledge base is reference documentation, not discussion. Community discussion happens on whatever platforms the community chooses (Discord, forums, etc.). IC provides infrastructure for shared knowledge, not social interaction beyond Community Groups.

**Phase:** Phase 4 (auto-generated API reference from Lua/YAML schema + initial CLI command reference). Phase 6a (SDK-embedded offline snapshot + context-sensitive authoring manual links, community-editable tutorials/cookbook). Seeded by the project maintainer during development — the design docs themselves are the initial knowledge base.

### Creator Content Program

**Lesson from ArmA/OFP:** Bohemia Interactive's Creator DLC program (launched 2019) showed that a structured quality ladder — from hobbyist to featured to commercially published — works when the criteria are transparent and the community governs curation. The program produced professional-quality content (Global Mobilization, S.O.G. Prairie Fire, CSLA Iron Curtain) while keeping the free modding ecosystem healthy.

IC adapts this concept within D035's voluntary framework (no mandatory paywalls, no IC platform fee):

| Tier            | Criteria                                                                                  | Recognition                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Published**   | Meets Workshop minimum standards (valid metadata, license declared, no malware)           | Listed in Workshop, available for search and dependency                                            |
| **Reviewed**    | Passes community review (2+ moderator approvals for quality, completeness, documentation) | "Reviewed" badge on Workshop page, eligible for "Staff Picks" featured section                     |
| **Featured**    | Selected by Workshop moderators or competitive committee for exceptional quality          | Promoted in Workshop "Featured" section, highlighted in in-game browser, included in starter packs |
| **Spotlighted** | Seasonal showcase — community-voted "best of" for maps, mods, campaigns, and assets       | Front-page placement, social media promotion, creator interview/spotlight                          |

**Key differences from Bohemia's Creator DLC:**
- **No paid tier at launch.** All tiers are free. D035's deferred optional `paid` pricing model (`M11+`, separate policy/governance decision) is available if the community evolves toward it, but the quality ladder operates independently of monetization.
- **Community curation, not publisher curation.** Workshop moderators and the competitive committee (both community roles) make tier decisions, not the project maintainer.
- **Transparent criteria.** Published criteria for each tier — creators know exactly what's needed to reach "Reviewed" or "Featured" status.
- **No exclusive distribution.** Featured content is Workshop content — it can be forked, depended on, and mirrored. No lock-in.

The Creator Content Program is a recognition and quality signal system, not a gatekeeping mechanism. The Workshop remains open to all — tiers help players find high-quality content, not restrict who can publish.

**Phase:** Phase 6a (integrated with Workshop moderator role from D037 governance structure). "Published" tier is automatic from Workshop launch (Phase 4–5). "Reviewed" and "Featured" require active moderators.

### Feedback Recognition Governance (Helpful Review Marks / Creator Triage)

If communities enable the optional "helpful review" recognition flow (D049/D053), governance rules must make clear that this is a **creator-feedback quality tool**, not a popularity contest or gameplay reward channel.

**Required governance guardrails:**
- **Documented criteria:** "Helpful" means actionable/useful for improvement, not necessarily positive sentiment.
- **Auditability:** Helpful-mark actions are logged and reviewable by moderators/community admins.
- **Anti-collusion enforcement:** Communities may revoke helpful marks and profile rewards if creator-reviewer collusion or alt-account farming is detected.
- **Contribution-point controls (if enabled):** Point grants/redemptions must remain profile/cosmetic-only, reversible, rate-limited, and auditable; no community may market them as gameplay advantages or ranked boosters.
- **Appeal path:** Players can appeal abuse-related revocations or sanctions under the same moderation framework as other D037 community actions.
- **Separation of concerns:** Helpful marks do not alter star ratings, report verdicts, ranked eligibility, or anti-cheat outcomes.

This keeps the system valuable for creator iteration while preventing "reward the nice reviews only" degeneration.

### Code of Conduct

Standard open-source code of conduct (Contributor Covenant or similar) applies to:
- Workshop resource descriptions and reviews
- In-game chat (client-side filtering, not server enforcement for non-ranked games)
- Competitive play (ranked games: stricter enforcement, report system, temporary bans for verified toxicity)
- Community forums and communication channels

**Alternatives considered:**
- BDFL (Benevolent Dictator for Life) model with no community input (faster decisions but risks OpenRA's fate — community alienation)
- Full democracy (too slow for a game project; bikeshedding on every decision)
- Corporate governance (inappropriate for an open-source community project)
- No formal governance (works early, creates problems at scale — better to define structure before it's needed)

**Phase:** Phase 0 (code of conduct, contribution guidelines), Phase 5 (competitive committee), Phase 7 (Workshop moderators, community representatives).

> **Phasing note:** This governance model is aspirational — it describes where the project aims to be at scale, not what launches on day one. At project start, governance is BDFL (maintainer) + trusted contributors, which is appropriate for a project with zero users. Formal elections, committees, and community representatives should not be implemented until there is an active community of 50+ regular contributors. The governance structure documented here is a roadmap, not a launch requirement. Premature formalization risks creating bureaucracy before there are people to govern.

---

---
