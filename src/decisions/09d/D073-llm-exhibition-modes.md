## D073: LLM Exhibition Matches & Prompt-Coached Modes — Spectacle Without Breaking Competitive Integrity

|                |                                                                                                                                                                                                                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**     | Accepted                                                                                                                                                                                                                                                                                    |
| **Phase**      | Phase 7 (custom/local exhibition + prompt-coached modes + replay metadata/overlay support), Phase 7+ (showmatch spectator prompt queue hardening + tournament tooling polish). Never part of ranked matchmaking (D055).                                                              |
| **Depends on** | D007 (relay), D010 (snapshottable state/replays), D012 (order validation), D034 (SQLite), D041 (AI trait/event log/fog view), D044 (LLM AI), D047 (LLM config manager/BYOLLM routing), D057 (skill library), D059 (communication + coach/observer rules), D071 (ICRP), D072 (server management), D055 (ranked policy) |
| **Driver**     | IC already supports LLM-controlled AI (D044), but it lacks a canonical match-level policy for LLM-vs-LLM exhibitions, human prompt-coached LLM play, and spectator-driven showmatches. Without a decision, communities will improvise modes that conflict with anti-coaching and competitive-integrity rules.                         |

### Decision Capsule (LLM/RAG Summary)

- **Status:** Accepted
- **Phase:** Phase 7 experimental/custom modes first, showmatch/tournament tooling polish later
- **Canonical for:** Match-level policy for LLM-vs-LLM exhibition play, prompt-coached LLM matches, spectator prompt showmatches, trust labels, and replay/privacy defaults
- **Scope:** `ic-ai`, `ic-llm`, `ic-ui`, `ic-net`, replay metadata/annotation capture, server policy/config; not a new sim/netcode architecture
- **Decision:** IC supports three opt-in, non-ranked LLM match surfaces: **LLM Exhibition**, **Prompt-Coached LLM**, and **Director/Showmatch Prompt** modes. All preserve sim determinism by recording and replaying orders only; prompts and LLM plan text are optional replay annotations with explicit privacy controls.
- **Why:** D044 already enables LLM AI behavior technically. D073 adds the social/tournament/server/replay policy layer so communities can safely run "LLM vs LLM" and "prompt duel" events without undermining D055 ranked integrity or D059 anti-coaching rules.
- **Non-goals:** Ranked LLM assistance, hidden spectator coaching in competitive play, direct observer order injection, storing provider credentials or API keys in replays/logs
- **Invariants preserved:** `ic-sim` remains pure (no LLM/network I/O), all gameplay effects still arrive as normal orders, fog/observer restrictions remain mode-dependent and explicit
- **Defaults / trust behavior:** Ranked disables all LLM-assisted player-control modes; fair tournament prompt coaching uses coach-role vision only; omniscient spectator prompting is showmatch-only and trust-labeled
- **Replay / privacy behavior:** Orders always recorded; LLM prompt text/reasoning capture is optional and strip/redact-able; API keys/tokens are never stored
- **Keywords:** LLM vs LLM, exhibition mode, prompt duel, coach AI, spectator prompts, showmatch, BYOLLM, replay annotations, trust labels, BYO-LLM fight night, live AI battle, spectator AI

### Problem

D044 solved the **AI implementation** problem:

- `LlmOrchestratorAi` (LLM gives strategic guidance to a conventional AI)
- `LlmPlayerAi` (experimental direct LLM control)

It did **not** define the **match governance** problem:

- What is allowed in ranked, tournament, custom, and showmatch contexts?
- Can observers send instructions to an LLM-controlled side without violating D059 anti-coaching rules?
- How are prompts routed, rate-limited, and labeled for fairness?
- What gets recorded in replays (orders only vs prompt transcripts vs LLM reasoning)?
- How do tournament organizers and server operators expose these modes safely through D071/D072?

Without a canonical policy, "fun exhibition features" become a trust-model footgun.

### Decision

Define a canonical family of opt-in LLM match surfaces built on D044:

1. **LLM Exhibition Match**
2. **Prompt-Coached LLM Match** (includes "Prompt Duel" variants)
3. **Director Prompt Showmatch** (spectator-driven / audience-driven prompts)

These are **match policy + UI + replay + server controls**, not new simulation or network architectures.

### Mode Taxonomy

#### 1. LLM Exhibition Match (baseline)

- One or more sides are controlled by `LlmOrchestratorAi` or `LlmPlayerAi` (D044)
- No human prompt input is required
- Primary use case: "watch GPT vs Claude/Ollama" style content, AI benchmarking, sandbox experimentation
- Eligible for local replay recording and replay sharing like any other match

#### 2. Prompt-Coached LLM Match (fair prompting)

- Each participating LLM side can have a **designated prompt coach seat**
- The coach submits strategic directives (text prompts / structured intents)
- The LLM remains the entity that turns context into gameplay orders
- The coach does **not** directly issue `PlayerOrder`s and is **not** a hidden spectator
- Fair-play default vision is **team-shared vision only** (same concept as D059 coach slot)

**Player-facing variant names (recommended):**

- `Prompt-Coached LLM`
- `Prompt Duel` (when both sides are prompt-only humans + their own LLMs)

#### 3. Director Prompt Showmatch (omniscient / audience-driven)

- Observers (or a designated director/caster) can submit prompts to one or both LLM sides
- Prompt sources may use observer/spectator views (including delayed or full-map depending on event settings)
- This is explicitly **showmatch / exhibition** behavior, never fair competitive play
- Match is trust-labeled accordingly (explicit showmatch/non-competitive labeling)

### Match Policy Matrix (Ranked, Tournament, Custom, Showmatch)

This matrix is the canonical policy layer that resolves the "can observers/LLMs do X here?" questions.

| Match Surface | D044 LLM AI Allowed? | Human Prompt Coach Seats? | Observer / Audience Prompts? | Vision Scope for Prompt Source | Competitive / Certification Status | Default Trust Label |
| --- | --- | --- | --- | --- | --- | --- |
| **Ranked Matchmaking (D055)** | **No** (for player-control assistance modes) | **No** | **No** | N/A | Ranked-certified path only | `ranked_native` |
| **Tournament (fair / competitive)** | Organizer option (typically `LlmOrchestratorAi` only for dedicated exhibition brackets; not normal ranked equivalence) | **Yes** (coach-style, explicit slot) | **No** | Team-shared vision only | Not ranked-certified unless no LLM/player assistance is active | `tournament_fair` or `tournament_llm_exhibition` |
| **Custom / LAN / Community Casual** | **Yes** | **Yes** | Host option | Team-shared by default; observer/full-map only if host enables | Unranked | `custom_llm` / `custom_prompt_coached` |
| **Showmatch / Broadcast Event** | **Yes** | **Yes** | **Yes** (director/audience queue) | Organizer-defined (team-view, delayed spectator, or omniscient) | Explicitly non-ranked, non-certified | `showmatch_director_prompt` |
| **Offline Sandbox / Replay Lab** | **Yes** | **Yes** | N/A (local user only) | User-defined | N/A | `offline_llm_lab` |

**Policy rule:** if any mode grants omniscient or spectator-sourced prompts to a live side, the match is **not** a fair competitive result and must never be labeled/routed as ranked-equivalent.

### Prompt Roles, Vision Scope, and Anti-Coaching Rules

D059 already establishes anti-coaching and observer isolation. D073 extends this by making prompting a **declared role**, not a loophole.

#### Prompt source roles

```rust
pub enum LlmPromptRole {
    /// Team-associated prompt source (fair mode). Mirrors D059 coach-slot intent.
    Coach,
    /// Organizer/caster/operator prompt source for a showmatch.
    Director,
    /// Audience participant submitting prompts into a moderated queue.
    Audience,
}

pub enum PromptVisionScope {
    /// Same view the coached side/team is entitled to (fair default).
    TeamSharedVision,
    /// Spectator view with organizer-defined delay (e.g., 120s).
    DelayedSpectator { delay_seconds: u32 },
    /// Full live observer view (showmatch only).
    OmniscientObserver,
}
```

#### Core rules

- **Ranked:** no prompt roles exist. Observer chat/voice isolation rules from D059 remain unchanged.
- **Fair tournament prompt coaching:** prompt source must be a declared coach seat (D059-style role), not a generic observer.
- **Showmatch spectator prompting:** allowed only under an explicit showmatch policy and trust label.
- **Prompt source vision must be shown in the UI** (e.g., `Coach (Team Vision)` vs `Director (Omniscient)`), so viewers understand what kind of "intelligence" the LLM is receiving.

### Prompt Submission Pipeline (Determinism-Safe)

The key rule from D044 remains unchanged: the sim replays **orders**, not LLM calls.

#### Determinism model

1. Prompt source submits a directive (UI or ICRP tool)
2. Relay/server stamps sender role + timestamps + match policy metadata
3. Designated LLM host for that side receives the directive
4. LLM (`LlmOrchestratorAi` or `LlmPlayerAi`) incorporates it into its next consultation/decision prompt
5. Resulting gameplay effects appear only as normal `PlayerOrder`s through the existing input/network pipeline
6. Replay records deterministic order stream as usual (D010/D044)

`ic-sim` sees no LLM APIs, no prompt text, and no external tool transport.

#### Prompt directives are not direct unit orders

Prompting is a **strategy channel**, not a hidden command channel.

- Allowed (examples):
  - "Switch to anti-air and scout north expansion"
  - "Play greedily for 2 minutes, then timing push west"
  - "Prioritize base defense; expect air harass"
- Not the design goal in fair modes:
  - frame-perfect unit micro scripts
  - direct hidden-intel exploitation
  - unrestricted order injection (that is a separate D071 `mod`/admin concern and disabled in ranked)

#### Relay/operator controls (rate limits and moderation)

Prompt submission must be server-controlled, similar to D059 chat anti-spam and D071 request budgets:

- max prompt submissions per user/window (configurable)
- max prompt length (chars/tokens)
- queue length cap per side
- optional moderator approval for audience prompts (showmatch mode)
- audit log entries for accepted/rejected prompts in tournament/showmatch operations

### Prompt-Coached Match Variants (Including "Player + LLM vs Player + LLM")

The user-proposed format maps cleanly to D073 as a **Prompt Duel** variant:

- Each side has:
  - one human prompt coach (or a shared coach team)
  - one LLM-controlled side (`LlmOrchestratorAi` recommended for v1)
- Human participants "play" through prompts only
- The LLM executes via D044 and emits orders

#### v1 recommendation

Default to **`LlmOrchestratorAi` + inner AI** rather than full `LlmPlayerAi` for prompt duel:

- more responsive under real-world BYOLLM latency
- better spectator experience (less idle time)
- easier to compare strategy quality rather than raw model micro latency

`LlmPlayerAi` remains an explicit experimental option for sandbox/showmatch content.

### BYOLLM and Provider Routing (D047 Integration)

D073 does not create a new LLM provider system. It reuses D016/D047:

- each LLM side uses a configured `LlmProvider`
- per-task routing can assign faster local models to match-time prompting/orchestration
- prompt strategy profiles (D047) remain provider/model-specific

#### Disclosure and replay metadata (safe subset only)

To make exhibitions understandable and reproducible without leaking secrets, IC records a safe metadata subset:

- provider alias/display name (e.g., `Local Ollama`, `OpenAI-compatible`)
- model name/id (if configured)
- prompt strategy profile id (D047)
- LLM mode (`orchestrator` vs `player`)
- skill library policy (`enabled`, `disabled`, `exhibition-tagged`)

**Never recorded:**

- API keys
- OAuth tokens
- raw provider credentials
- local filesystem paths that reveal secrets

### Replay Recording, Download, and Spectator Value

D073 explicitly leans on the existing replay architecture rather than inventing a separate export:

- deterministic replay = initial state + order stream (D010/D044)
- server/community download paths = D071 `relay/replay.download` and D072 dashboard replay download
- local browsing/viewing = replay browser and replay viewer flows

This means "LLM match as content" already inherits IC's normal replay strengths:

- local playback
- shareable `.icrep`
- signed replay support when played via relay (D007)
- analysis tooling via existing replay/event infrastructure

#### LLM spectator overlays (live and replay)

D044 already defines observability for the current strategic plan and event log narrative. D073 standardizes when and how that becomes a viewer-facing mode feature:

- current LLM mode badge (`Orchestrator` / `LLM Player`)
- current plan summary ("AA focus, fortify north choke, expand soon")
- prompt transcript panel (if recorded and enabled)
- prompt source badges (`Coach`, `Director`, `Audience`)
- vision scope badges (`Team Vision`, `Delayed Observer`, `Omniscient`)
- trust label banner (`Showmatch — Director Prompts Enabled`)

### Replay & Privacy Rules (Prompts / Reasoning / Metadata)

Orders remain the canonical gameplay record. Everything else is optional annotation.

#### Replay privacy matrix (LLM-specific additions)

| LLM-Related Replay Data | Recorded by Default (Custom/Showmatch) | Public Share Default | Notes |
| --- | --- | --- | --- |
| **LLM mode + trust label** | Yes | Yes | Needed to interpret the match and avoid misleading "competitive" framing |
| **Provider/model/profile metadata (safe subset)** | Yes | Yes | No secrets/credentials |
| **Accepted prompt timestamps + sender role** | Yes | Yes | Lightweight annotation; good for replay commentary and audits |
| **Accepted prompt full text** | Custom: configurable (`off` default) / Showmatch: configurable (`on` recommended) | Off unless creator opts in | Entertainment value is high, but can reveal private strategy/team comms |
| **Rejected/queued audience prompts** | No (default) | No | High noise + moderation/privacy risk; enable only for event archives |
| **LLM raw reasoning text / chain-like verbose output** | No (default) | No | Privacy + prompt/IP leakage risk; prefer concise plan summaries |
| **Plan summary / strategic updates** | Yes (summary form) | Yes | D044 observability value without leaking full prompt internals |
| **API keys / tokens / credentials** | Never | Never | Hard prohibition |

#### Replay privacy controls

D073 adds LLM-specific controls analogous to D059 voice controls:

- `replay.record_llm_annotations` (`off` / `summary` / `full_prompts`)
- `replay.record_llm_reasoning` (`false` default; advanced/debug only)
- `/replay strip-llm <file>` (remove all LLM annotation streams/metadata except trust label)
- `/replay redact-prompts <file>` (keep timestamps/roles, remove prompt text)

**Design rule:** a replay must remain fully playable if all LLM annotations are stripped.

### Skill Library Integrity (D057) — Fair vs Omniscient Inputs

D057 skill accumulation should not quietly learn from contaminated contexts.

#### Policy

- **Fair prompt-coached matches** (`Coach`, `TeamSharedVision`) may contribute to D057 skill verification if enabled
- **Director/audience/omniscient prompt modes** are tagged as assisted/showmatch data and are excluded from automatic promotion to `Established`/`Proven` AI skills by default
- Operators/tools may still keep this data for entertainment analytics or experimental offline analysis

This prevents "omniscient crowd coaching" from polluting the general-purpose strategy skill library.

### Server and Tooling Integration (D071 + D072)

D073 does not require a new remote-permission tier. It reuses existing boundaries:

- **In-client UI** for local prompt seats and spectator controls
- **D071 `mod` tier / mode-registered commands** for showmatch prompt tooling and integrations (disabled in ranked by D071 policy)
- **D072 dashboard + relay ops** for replay download, trust-label visibility, and tournament operations

#### Operator-facing policy knobs (spec-level)

```toml
[llm_match_modes]
enabled = true

# Ranked remains hard-disabled for prompt/LLM assistance modes.
allow_in_ranked = false

# Custom/community defaults
allow_prompt_coached = true
allow_director_prompt_showmatch = false

# Vision policy for showmatch prompts
showmatch_prompt_vision = "delayed_observer" # team_shared | delayed_observer | omniscient
showmatch_observer_delay_seconds = 120

# Prompt spam control
prompt_rate_limit_per_user = "1/10s"
max_prompt_chars = 300
max_prompt_queue_per_side = 20

# Replay annotation capture
replay_llm_annotations = "summary"          # off | summary | full_prompts
replay_llm_reasoning = false
```

### UI/UX Rules (Player and Viewer Clarity)

LLM match modes are only useful if the audience can tell what they are watching.

#### Lobby / server browser labels

- Match tiles must show an **LLM mode badge** when any side is LLM-controlled
- Prompt-coached and director-prompt matches must show a **trust/integrity badge**
- Showmatch listings must never resemble ranked listings in color/icon language

#### In-match disclosure

When a live match uses prompt coaching or director prompting, all participants and spectators should see:

- which sides are LLM-controlled
- which prompt roles are active
- prompt vision scope
- whether prompt text is being recorded for replay

This mirrors D059's consent/disclosure philosophy (voice recording) and anti-coaching clarity.

### Experimental: BYO-LLM Fight Night (Live Spectator AI Battles)

An explicit experimental format built on the D073 policy stack: community events where players **bring their own LLM configuration** and pit them against each other in front of a live audience.

#### Concept

Think Twitch-style "whose AI is better" events:

1. Each contestant registers an LLM setup: provider, model, prompt strategy profile (D047), optional system prompt / persona
2. Contestants are matched (bracket, round-robin, or challenge format)
3. The match runs live with spectator overlays showing each LLM's current plan summary, prompt role badges, and model identity
4. Audience watches in real-time via spectator mode or stream, seeing both sides' strategic reasoning unfold

The format naturally creates community content, rivalry, and iterative improvement loops as players refine their prompts and model choices between events.

#### How It Maps to D073 Infrastructure

| Fight Night Element | D073 Mechanism | Notes |
| --- | --- | --- |
| Player submits LLM config | D047 `LlmProvider` + prompt strategy profile | Player brings their own API key / local model |
| LLM controls a side | D044 `LlmOrchestratorAi` (recommended v1) | `LlmPlayerAi` as experimental opt-in |
| Live audience viewing | D073 spectator overlays + trust labels | Plan summary panel, model badge, mode banner |
| Match governance | `LLM Exhibition Match` policy (mode 1) | No prompt coaching — pure LLM vs LLM |
| Prompted variant | `Prompt Duel` policy (mode 2) | Each player coaches their own LLM live |
| Replay / VOD | Standard replay + LLM annotation capture | Shareable `.icrep` with optional prompt transcript |
| Tournament ops | D071 ICRP + D072 dashboard | Bracket management, match scheduling, replay archive |

#### Experimental Scope and Constraints

- **Phase 7 experimental feature** — ships alongside general D073 modes, not separately
- **Never ranked** — D055 exclusion applies unconditionally
- **BYOLLM only** — IC does not provide or host LLM inference; players bring their own provider/key
- **No credential sharing** — each contestant's API keys stay local to their client; the relay never sees them
- **Latency fairness is best-effort** — local Ollama vs cloud API latency differences are inherent to the format and part of the meta (choosing fast models matters); consider optional per-turn time budgets as a future fairness knob
- **Skill library (D057) eligibility** — pure LLM-vs-LLM exhibition results may feed D057 with `exhibition` tag; omniscient/audience-prompted variants are excluded from skill promotion per D073 policy

#### Community Event Tooling (Future, Post-v1)

- Bracket/tournament management via D071 ICRP commands
- Automated match scheduling and result recording
- Leaderboard / Elo-style rating for registered LLM configs (community-run, not official ranked)
- "Fight card" lobby UI showing upcoming matches, contestant LLM identities, and past records
- Highlight reel / clip generation from replay annotations

These are community-driven extensions, not core engine features. IC provides the match policy, replay infrastructure, and ICRP tooling surface; communities build the event layer on top.

### What This Is Not

- **Not ranked AI assistance.** D055 ranked remains human-skill measurement.
- **Not a hidden observer-coaching backdoor.** Observer prompting is showmatch-only and trust-labeled.
- **Not a requirement for replays.** Replays work without any LLM annotation capture.
- **Not a replacement for D044.** D044 defines the LLM AI implementations; D073 defines match policies and social surfaces around them.

### Alternatives Considered

1. **Allow prompt-coached LLM play in ranked** (rejected — incompatible with D055 competitive integrity and D059 anti-coaching principles)
2. **Treat prompts as direct `PlayerOrder` injections** (rejected — blurs the strategy/prompt channel into hidden input automation; D071 already defines explicit admin/mod injection paths)
3. **Allow generic observers to prompt live sides in all modes** (rejected — covert coaching/multi-account abuse; only acceptable in explicit showmatch mode)
4. **Record full prompts + full reasoning by default** (rejected — privacy leakage, prompt/IP leakage, noisy replays; summary-first is the right default)
5. **Record no LLM annotations at all** (rejected — undermines the spectator/replay value proposition of LLM exhibitions and makes moderation/audit harder)

### Cross-References

- **D044 (LLM AI):** Supplies `LlmOrchestratorAi` and `LlmPlayerAi`; D073 wraps them in match policy
- **D047 (LLM Config Manager):** BYOLLM provider routing, prompt strategy profiles, capability probing
- **D057 (Skill Library):** D073 adds fairness tagging rules for skill promotion eligibility
- **D059 (Communication):** Coach-slot semantics, observer anti-coaching, consent/disclosure philosophy
- **D071 (ICRP):** External tooling and showmatch prompt integrations via existing permission model
- **D072 (Server Management):** Operator workflow, dashboard visibility, replay download operations
- **D055 (Ranked):** Hard exclusion of LLM-assisted player-control modes from ranked certification

### Execution Overlay Mapping

- **Milestone:** Phase 7 (`M7`) LLM ecosystem
- **Priority:** `P-Platform` + `P-Experience` (community content + spectator value)
- **Feature Cluster:** `M7.LLM.EXHIBITION_MODES`
- **Depends on (hard):**
  - D044 LLM AI implementations
  - Replay capture/viewer infrastructure (D010 + replay format work)
  - D059 role/observer communication policies
- **Depends on (soft):**
  - D071/D072 tooling for showmatch production workflows
  - D057 skill-library fairness tagging / filtering
