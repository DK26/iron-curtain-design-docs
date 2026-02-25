# Experimental LLM Modes & Plans (BYOLLM)

This page is the **human-facing overview** of Iron Curtain's LLM-related modes and plans for:

- players
- spectators and tournament organizers
- modders and creators
- tool developers

Everything here is **design-stage only** (no playable build yet) and should be treated as **experimental**. Some items are "accepted" decisions in the docs, but that means "accepted as a design direction," not "implemented" or "stable."

> `BYOLLM` = **Bring Your Own LLM**. Iron Curtain does not ship or require a model/provider. You configure your own local or cloud provider if you want these features.

> For agentic retrieval / RAG routing, use `LLM-INDEX.md`. This page is for humans.

---

## Ground Rules (Applies to All LLM Features)

- **Optional, never required.** The game and SDK are designed to work fully without any LLM configured (D016).
- **BYOLLM only.** Users choose providers/models; the engine does not bundle a mandatory vendor (D016, D047).
- **Determinism preserved.** `ic-sim` never performs LLM or network I/O. LLM outputs affect gameplay only by producing normal orders through existing pipelines (D044, D073).
- **No ranked assistance.** LLM-controlled/player-assisted match modes are excluded from ranked-certified play (D044, D073, D055).
- **Privacy and disclosure matter.** Replay annotations, prompt capture, and voice-like context features are opt-in/configurable, with stripping/redaction paths planned (D059, D073).
- **Standard outputs for creators.** Generated content is standard YAML/Lua/assets, not opaque engine-only blobs (D016, D040).

---

## Quick Map by Audience

### Players

- **LLM-generated missions/campaigns** (BYOLLM, optional) — D016
- **LLM-enhanced AI opponents** (`LlmOrchestratorAi`, experimental `LlmPlayerAi`) — D044
- **LLM exhibition / prompt-coached match modes** (showmatch/custom-focused) — D073
- **LLM coaching / post-match commentary** (optional, built on behavioral profiles) — D042 + D016

### Spectators / Organizers / Community Servers

- **LLM-vs-LLM exhibitions and showmatches** with trust labels — D073
- **Prompt-duel / prompt-coached events** with fair-vs-showmatch policy separation — D073
- **Replay download and review flows** for LLM matches via normal replay infrastructure — D071 + D072 + D010

### Modders / Creators

- **LLM mission and campaign generation** (editable YAML+Lua outputs) — D016
- **Replay-to-scenario narrative generation** (optional LLM layer on top of replay extraction) — D038 + D016
- **Asset Studio agentic generation** (optional Layer 3 in SDK) — D040
- **LLM-callable editor tools (planned)** for structured editor automation — D016
- **Custom factions (planned, BYOLLM)** — D016

### Tool Developers

- **ICRP + MCP integration** for coaching, replay analysis, overlays, and external tools — D071
- **LLM provider management, routing, and prompt strategy profiles** — D047
- **Skill library-backed learning loops** (AI/content generation patterns) — D057

---

## Player-Facing LLM Gameplay Modes

### 1. LLM-Enhanced AI (Skirmish / Custom / Sandbox)

Canonical: D044

Two designed modes:

- **`LlmOrchestratorAi`** (Phase 7)
  - Wraps a normal AI
  - LLM gives periodic strategic guidance
  - Inner AI handles tick-level execution/micro
  - Best default for actual playability and spectator readability
- **`LlmPlayerAi`** (experimental, no scheduled phase)
  - LLM makes all decisions directly
  - Entertainment/experiment value is the main point
  - Expected to be weaker/slower than conventional AI because of latency and spatial reasoning limits

Important constraints:

- not allowed in ranked
- replay determinism is preserved by recording orders, not LLM calls
- observable overlays are part of the design (plan summaries/debug/spectator visibility)

### 2. LLM Exhibition / Prompt-Coached / Showmatch Modes

Canonical: D073 (built on D044)

These are **match-policy modes**, not new simulation architectures:

- **LLM Exhibition Match**
  - LLM-controlled sides play each other (or play humans/AI) with no human prompting required
  - "GPT vs Claude/Ollama"-style community content
- **Prompt-Coached LLM Match / Prompt Duel**
  - Humans guide LLM-controlled sides with strategy prompts
  - The LLM still translates prompts + game context into gameplay orders
  - Recommended v1 path: coach + `LlmOrchestratorAi`
- **Director Prompt Showmatch**
  - Casters/directors/audience can feed prompts in a labeled showmatch context
  - Explicitly non-ranked / non-certified

Fairness model (important):

- ranked: no LLM prompt-assist modes
- fair tournament prompt coaching: coach-role semantics + team-shared vision only
- omniscient spectator prompting: showmatch-only, trust-labeled

---

## Player-Facing LLM Content Generation (Campaigns / Missions)

### 3. LLM-Generated Missions & Campaigns (BYOLLM)

Canonical: D016

Planned Phase 7 optional features include:

- single mission generation
- player-aware generation (using local data if available)
- replay-to-scenario narrative generation (paired with D038 extraction pipeline)
- full generative branching campaigns
- generative media for campaigns/missions (voice/music/sfx; provider-specific)

Design intent:

- hand-authored campaigns (D021) remain the primary non-LLM path
- LLM generation is a power-user content expansion path
- outputs are standard, editable IC content formats

### 4. LLM Coaching / Commentary / Training Loop

Canonical: D042 (with D016 and D047 integration)

This is the "between matches" / "learn faster" path:

- post-match coaching suggestions
- personalized commentary and training plans
- behavioral-profile-aware guidance
- integration with local gameplay history in SQLite

D042 also supports the non-LLM training path; LLM coaching is an optional enhancement layered on top.

---

## Spectator, Replay, and Event Use Cases

### 5. Replays for LLM Matches (Still Normal IC Replays)

Canonical: D010, D044, D073, D071, D072

LLM matches use the same replay foundation as everything else:

- deterministic order streams remain the gameplay source of truth
- replays can be replayed locally
- relay-hosted matches can use signed replay workflows (D007)
- server/dashboard/API replay download paths remain applicable (D072, D071)

What D073 adds is **annotation policy**, not a new replay format:

- optional prompt timestamps/roles
- optional prompt text capture
- plan summaries for spectator context
- trust labels (e.g., showmatch/director-prompt)
- stripping/redaction flows for sharing

### 6. Spectator and Tournament Positioning

Canonical: D073 + D059 + D071

IC distinguishes clearly between:

- **fair competitive contexts** (no hidden observer prompting/coaching)
- **coached events** (declared coach role, restricted vision)
- **showmatches** (omniscient/director/audience prompts allowed, clearly labeled)

This is a core trust/UX requirement, not just a UI detail.

---

## Modder / Creator LLM Tooling (SDK-Focused)

### 7. Scenario Editor + Replay-to-Scenario Narrative Layer

Canonical: D038 + D016

The scenario editor pipeline includes a replay-to-scenario path:

- direct extraction works without an LLM
- optional LLM generation adds narrative layers (briefings, objectives wording, dialogue, context)
- outputs remain editable in the SDK

This is useful for:

- turning replays into challenge missions
- creating training scenarios
- remixing tournament games into campaigns

### 8. Asset Studio Agentic Generation (Optional Layer)

Canonical: D040 (Phase 7 for Layer 3)

Asset Studio is useful without LLMs. The LLM layer is an optional enhancement for:

- generating/modifying visual assets
- in-context iterative preview workflows
- provenance-aware creator tooling (with metadata)

This is explicitly a creator convenience layer, not a requirement for asset workflows.

### 9. LLM-Callable Editor Tool Bindings (Planned)

Canonical: D016 (Phase 7 editor integration)

Planned direction:

- expose structured editor operations as tool-callable actions
- let an LLM assist with repetitive editor tasks via validated command paths
- keep the editor command registry as the source of truth

This is aimed at modder productivity and SDK automation, not live gameplay.

### 10. Custom Faction / Content Generation (Planned)

Canonical: D016

Planned BYOLLM path for power users:

- generate faction concepts into editable YAML-based faction definitions
- pull compatible Workshop resources (subject to permissions/licensing rules)
- validate and iterate in normal modding workflows

This is a planned experimental feature, not a core onboarding path for modders.

---

## Tooling & Infrastructure That Makes LLM Features Practical

### 11. LLM Configuration Manager (BYOLLM UX Layer)

Canonical: D047

Why it exists:

- different tasks need different model/provider tradeoffs
- local vs cloud models need different prompt strategies
- users may want multiple providers at once

Key planned capabilities:

- multiple provider profiles
- task-specific routing (e.g., fast local for orchestration, richer cloud for generation)
- prompt strategy profiles (auto + override)
- capability probing and prompt test harness
- shareable configs without API keys

### 12. LLM Skill Library (Lifelong Learning Layer)

Canonical: D057

Purpose:

- store verified strategy/content-generation patterns
- improve over time without fine-tuning models
- remain portable under BYOLLM

Important nuance:

- this is not a replay database
- it stores compact verified patterns (skills), not full replays
- D073 adds fairness tagging so omniscient showmatch prompting does not pollute normal competitive-ish skill learning by default

### 13. External Tool API + MCP

Canonical: D071

ICRP is the bridge for external ecosystems:

- replay analyzers
- overlays
- coaching tools
- tournament software
- MCP-based LLM clients/tools (analysis/coaching workflows)

It is designed to preserve determinism and competitive integrity:

- reads from post-tick snapshots
- writes (where allowed) go through normal order paths
- ranked restrictions and fog filtering apply

---

## Experimental Status & Phase Snapshot

This page is a consolidation of **planned** LLM features. Most of the LLM-heavy work clusters in **Phase 7**.

| Area | Example Modes / Features | Planned Phase | Experimental Notes |
| --- | --- | --- | --- |
| LLM missions/campaigns | Mission gen, generative campaigns, replay narrative layer | Phase 7 | Optional BYOLLM only; hand-authored campaigns remain primary |
| LLM-enhanced AI | `LlmOrchestratorAi` | Phase 7 | Best path for practical gameplay/spectating |
| Full LLM player | `LlmPlayerAi` | Experimental, no scheduled phase | Architecture supported; quality/latency dependent |
| LLM exhibition/prompt matches | LLM exhibition, prompt duel, director showmatch | Phase 7 | Explicitly non-ranked, trust-labeled |
| LLM coaching | Post-match coaching loop | Phase 7 (LLM layer) | Built on D042 profile/training system |
| LLM config/routing | LLM Manager, prompt profiles, capability probes | Phase 7 | Supports the rest of BYOLLM features |
| Skill library | Verified reusable AI/generation skills | Phase 7 | Can start accumulating once D044 exists |
| Asset generation in SDK | Asset Studio Layer 3 | Phase 7 | Optional creator enhancement |
| MCP / external LLM tools | ICRP MCP workflows | Phase 6a+ | Infrastructure phases start earlier than most LLM gameplay/content features |

---

## Competitive Integrity Summary (Short Version)

If you only remember one thing:

- **LLM features are optional**
- **LLM gameplay assistance is not for ranked**
- **spectator prompting is only acceptable in explicit showmatches**
- **fair coached events must declare the coach role and vision scope**

This is the line that keeps the LLM experimentation ecosystem compatible with IC's competitive goals.

---

## Canonical Decision Map (Read These for Details)

### Core LLM Features

- `D016` — LLM-generated missions/campaigns and BYOLLM architecture
- `D042` — behavioral profiles + optional LLM coaching loop
- `D044` — LLM-enhanced AI (`LlmOrchestratorAi`, `LlmPlayerAi`)
- `D047` — LLM configuration manager (providers/routing/profiles)
- `D057` — LLM skill library
- `D073` — LLM exhibition and prompt-coached match modes

### Creator / Tooling / Replay Adjacent

- `D038` — scenario editor (includes replay-to-scenario pipeline; optional LLM narrative layer)
- `D040` — Asset Studio (optional agentic generation layer)
- `D071` — external tool API / ICRP / MCP
- `D072` — server management (replay download/admin surfaces)
- `D059` — communication/coach/observer rules (important for LLM showmatch fairness)
- `D010` — replay/snapshot foundations

---

## Suggested Public Messaging (If You Want a One-Paragraph Summary)

Iron Curtain's LLM features are a **BYOLLM, opt-in, experimental power-user layer** for content generation, AI experimentation, replay analysis, and creator tooling. The engine is fully playable and moddable without any LLM configured. Competitive integrity remains intact because ranked play excludes LLM-assisted modes, and showmatch/coached LLM events are explicitly labeled with clear trust and visibility rules.

