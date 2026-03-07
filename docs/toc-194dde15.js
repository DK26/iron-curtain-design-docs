// Populate the sidebar
//
// This is a script, and not included directly in the page, to control the total size of the book.
// The TOC contains an entry for each page, so if each page includes a copy of the TOC,
// the total size of the page becomes O(n**2).
class MDBookSidebarScrollbox extends HTMLElement {
    constructor() {
        super();
    }
    connectedCallback() {
        this.innerHTML = '<ol class="chapter"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="00-INDEX.html">Introduction</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="FOREWORD.html">Foreword — Why I&#39;m Building This</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="OVERVIEW.html">What Iron Curtain Offers</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="CAPABILITIES.html">Platform Capabilities</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="LLM-INDEX.html">LLM / RAG Retrieval Index</a></span></li><li class="chapter-item expanded "><li class="spacer"></li></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="01-VISION.html"><strong aria-hidden="true">1.</strong> Vision &amp; Competitive Landscape</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="02-ARCHITECTURE.html"><strong aria-hidden="true">2.</strong> Core Architecture</a></span><ol class="section"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="architecture/gameplay-systems.html"><strong aria-hidden="true">2.1.</strong> Extended Gameplay Systems (RA1)</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="architecture/game-loop.html"><strong aria-hidden="true">2.2.</strong> Game Loop</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="architecture/state-recording.html"><strong aria-hidden="true">2.3.</strong> State Recording &amp; Replay Infrastructure</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="architecture/pathfinding.html"><strong aria-hidden="true">2.4.</strong> Pathfinding &amp; Spatial Queries</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="architecture/platform-portability.html"><strong aria-hidden="true">2.5.</strong> Platform Portability</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="architecture/ui-theme.html"><strong aria-hidden="true">2.6.</strong> UI Theme System (D032)</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="architecture/qol-toggles.html"><strong aria-hidden="true">2.7.</strong> QoL &amp; Gameplay Behavior Toggles (D033)</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="architecture/ra-experience.html"><strong aria-hidden="true">2.8.</strong> Red Alert Experience Recreation Strategy</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="architecture/first-runnable.html"><strong aria-hidden="true">2.9.</strong> First Runnable — Bevy Loading RA Resources</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="architecture/crate-graph.html"><strong aria-hidden="true">2.10.</strong> Crate Dependency Graph</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="architecture/install-layout.html"><strong aria-hidden="true">2.11.</strong> Install &amp; Source Layout</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="architecture/sdk-editor.html"><strong aria-hidden="true">2.12.</strong> IC SDK &amp; Editor Architecture (D038 + D040)</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="architecture/multi-game.html"><strong aria-hidden="true">2.13.</strong> Multi-Game Extensibility (Game Modules)</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="architecture/type-safety.html"><strong aria-hidden="true">2.14.</strong> Type-Safety Architectural Invariants</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="architecture/api-misuse-defense.html"><strong aria-hidden="true">2.15.</strong> API Misuse Analysis &amp; Type-System Defenses</a></span><ol class="section"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="architecture/api-misuse-patterns.html"><strong aria-hidden="true">2.15.1.</strong> API Patterns &amp; Gap Analysis</a></span></li></ol><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="architecture/data-flows-overview.html"><strong aria-hidden="true">2.16.</strong> Data-Sharing Flows Overview</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="architecture/security-audit-findings.html"><strong aria-hidden="true">2.17.</strong> Security Audit Findings</a></span></li></ol><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="03-NETCODE.html"><strong aria-hidden="true">3.</strong> Network Architecture</a></span><ol class="section"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="netcode/protocol.html"><strong aria-hidden="true">3.1.</strong> Protocol &amp; Overview</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="netcode/relay-architecture.html"><strong aria-hidden="true">3.2.</strong> Relay Architecture</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="netcode/sub-tick-timing.html"><strong aria-hidden="true">3.3.</strong> Sub-Tick Timing &amp; Fairness</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="netcode/wire-format.html"><strong aria-hidden="true">3.4.</strong> Wire Format &amp; Message Lanes</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="netcode/desync-recovery.html"><strong aria-hidden="true">3.5.</strong> Desync Detection &amp; Recovery</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="netcode/why-faster.html"><strong aria-hidden="true">3.6.</strong> Why It Feels Faster</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="netcode/network-model-trait.html"><strong aria-hidden="true">3.7.</strong> NetworkModel Trait</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="netcode/dev-tools.html"><strong aria-hidden="true">3.8.</strong> Development Tools</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="netcode/connection-establishment.html"><strong aria-hidden="true">3.9.</strong> Connection Establishment</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="netcode/tracking-backend.html"><strong aria-hidden="true">3.10.</strong> Tracking Servers &amp; Backend</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="netcode/match-lifecycle.html"><strong aria-hidden="true">3.11.</strong> Match Lifecycle</a></span><ol class="section"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="netcode/vote-framework.html"><strong aria-hidden="true">3.11.1.</strong> Vote Framework</a></span></li></ol><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="netcode/multiplayer-scaling.html"><strong aria-hidden="true">3.12.</strong> Multi-Player Scaling</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="netcode/system-wiring.html"><strong aria-hidden="true">3.13.</strong> System Wiring</a></span></li></ol><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="04-MODDING.html"><strong aria-hidden="true">4.</strong> Modding System</a></span><ol class="section"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="modding/yaml-rules.html"><strong aria-hidden="true">4.1.</strong> Tier 1: YAML Rules</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="modding/lua-scripting.html"><strong aria-hidden="true">4.2.</strong> Tier 2: Lua Scripting</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="modding/wasm-modules.html"><strong aria-hidden="true">4.3.</strong> Tier 3: WASM Modules</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="modding/tera-templating.html"><strong aria-hidden="true">4.4.</strong> Tera Templating</a></span><ol class="section"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="modding/tera-templating-advanced.html"><strong aria-hidden="true">4.4.1.</strong> Advanced Templating</a></span></li></ol><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="modding/resource-packs.html"><strong aria-hidden="true">4.5.</strong> Resource Packs</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="modding/campaigns.html"><strong aria-hidden="true">4.6.</strong> Campaign System</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="modding/workshop.html"><strong aria-hidden="true">4.7.</strong> Workshop</a></span><ol class="section"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="modding/workshop-features.html"><strong aria-hidden="true">4.7.1.</strong> Workshop Features</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="modding/workshop-moderation.html"><strong aria-hidden="true">4.7.2.</strong> Workshop Moderation</a></span></li></ol><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="modding/mod-sdk.html"><strong aria-hidden="true">4.8.</strong> Mod SDK &amp; Dev Experience</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="modding/llm-metadata.html"><strong aria-hidden="true">4.9.</strong> LLM-Readable Metadata</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="modding/api-stability.html"><strong aria-hidden="true">4.10.</strong> Mod API Stability</a></span></li></ol><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="05-FORMATS.html"><strong aria-hidden="true">5.</strong> File Formats &amp; Source Insights</a></span><ol class="section"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="formats/binary-codecs.html"><strong aria-hidden="true">5.1.</strong> Binary Codecs &amp; EA Insights</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="formats/save-replay-formats.html"><strong aria-hidden="true">5.2.</strong> Save &amp; Replay Formats</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="formats/backup-screenshot-import.html"><strong aria-hidden="true">5.3.</strong> Backup, Screenshot &amp; Import</a></span></li></ol><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="06-SECURITY.html"><strong aria-hidden="true">6.</strong> Security &amp; Threat Model</a></span><ol class="section"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="security/threat-model.html"><strong aria-hidden="true">6.1.</strong> Threat Model &amp; Core Vulns (V1–V5)</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="security/vulns-mods-replays.html"><strong aria-hidden="true">6.2.</strong> Mods &amp; Replays (V6–V10)</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="security/vulns-client-cheating.html"><strong aria-hidden="true">6.3.</strong> Client Cheating (V11–V13)</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="security/vulns-protocol.html"><strong aria-hidden="true">6.4.</strong> Protocol &amp; Transport (V14–V17)</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="security/vulns-workshop.html"><strong aria-hidden="true">6.5.</strong> Workshop Security (V18–V25)</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="security/vulns-ranked.html"><strong aria-hidden="true">6.6.</strong> Ranked Integrity (V26–V32)</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="security/vulns-infrastructure.html"><strong aria-hidden="true">6.7.</strong> Infrastructure &amp; Sandbox (V33–V42)</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="security/vulns-identity-sandboxing.html"><strong aria-hidden="true">6.8.</strong> Identity &amp; Module Isolation (V43–V52)</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="security/vulns-edge-cases-infra.html"><strong aria-hidden="true">6.9.</strong> Edge Cases &amp; Summary (V53–V60)</a></span></li></ol><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="07-CROSS-ENGINE.html"><strong aria-hidden="true">7.</strong> Cross-Engine Compatibility</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="08-ROADMAP.html"><strong aria-hidden="true">8.</strong> Development Roadmap</a></span><ol class="section"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="roadmap/phases-6-7.html"><strong aria-hidden="true">8.1.</strong> Phases 6a–7</a></span></li></ol><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="18-PROJECT-TRACKER.html"><strong aria-hidden="true">9.</strong> Project Tracker &amp; Implementation Planning</a></span><ol class="section"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="tracker/overview.html"><strong aria-hidden="true">9.1.</strong> Overview &amp; Active Track</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="tracker/build-sequence.html"><strong aria-hidden="true">9.2.</strong> Completeness Audit &amp; Build Sequence</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="tracker/checklists.html"><strong aria-hidden="true">9.3.</strong> Developer Task Checklists</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="tracker/decision-tracker.html"><strong aria-hidden="true">9.4.</strong> Decision Tracker (All Dxxx)</a></span><ol class="section"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="tracker/decision-tracker-d001-d020.html"><strong aria-hidden="true">9.4.1.</strong> Decisions D001–D020</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="tracker/decision-tracker-d021-d042.html"><strong aria-hidden="true">9.4.2.</strong> Decisions D021–D042</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="tracker/decision-tracker-d043-d060.html"><strong aria-hidden="true">9.4.3.</strong> Decisions D043–D060</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="tracker/decision-tracker-d061-d076.html"><strong aria-hidden="true">9.4.4.</strong> Decisions D061–D076</a></span></li></ol><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="tracker/coverage-and-risks.html"><strong aria-hidden="true">9.5.</strong> Coverage, Risks &amp; Pending Gates</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="tracker/maintenance-rules.html"><strong aria-hidden="true">9.6.</strong> Maintenance Rules</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="tracking/milestone-dependency-map.html"><strong aria-hidden="true">9.7.</strong> Milestone Dependency Map</a></span><ol class="section"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="tracking/milestone-deps/execution-ladders.html"><strong aria-hidden="true">9.7.1.</strong> Execution Ladders</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="tracking/milestone-deps/clusters-m0-m1.html"><strong aria-hidden="true">9.7.2.</strong> Clusters M0–M1</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="tracking/milestone-deps/clusters-m2-m4.html"><strong aria-hidden="true">9.7.3.</strong> Clusters M2–M4</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="tracking/milestone-deps/clusters-m5-m6.html"><strong aria-hidden="true">9.7.4.</strong> Clusters M5–M6</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="tracking/milestone-deps/clusters-m7-addenda.html"><strong aria-hidden="true">9.7.5.</strong> Clusters M7 &amp; Addenda</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="tracking/milestone-deps/clusters-m8.html"><strong aria-hidden="true">9.7.6.</strong> Clusters M8</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="tracking/milestone-deps/clusters-m9.html"><strong aria-hidden="true">9.7.7.</strong> Clusters M9</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="tracking/milestone-deps/clusters-m10-m11.html"><strong aria-hidden="true">9.7.8.</strong> Clusters M10–M11</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="tracking/milestone-deps/gates-and-mappings.html"><strong aria-hidden="true">9.7.9.</strong> Gates &amp; Mappings</a></span></li></ol><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="tracking/project-tracker-schema.html"><strong aria-hidden="true">9.8.</strong> Project Tracker Automation Companion (Optional Schema/YAML Reference)</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="tracking/implementation-ticket-template.html"><strong aria-hidden="true">9.9.</strong> Implementation Ticket Template (G-Step Aligned)</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="tracking/future-language-audit.html"><strong aria-hidden="true">9.10.</strong> Future / Deferral Language Audit</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="tracking/deferral-wording-patterns.html"><strong aria-hidden="true">9.11.</strong> Deferral Wording Patterns</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="tracking/external-code-project-bootstrap.html"><strong aria-hidden="true">9.12.</strong> External Code Project Bootstrap (Design-Aligned)</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="tracking/external-project-agents-template.html"><strong aria-hidden="true">9.13.</strong> External Project AGENTS.md Template</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="tracking/source-code-index-template.html"><strong aria-hidden="true">9.14.</strong> Source Code Index Template (Human + LLM)</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="tracking/ic-engine-agents.html"><strong aria-hidden="true">9.15.</strong> IC Engine AGENTS.md (Filled-In)</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="tracking/ic-engine-code-index.html"><strong aria-hidden="true">9.16.</strong> IC Engine CODE-INDEX.md (Filled-In)</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="tracking/netcode-research-alignment-audit-2026-02-27.html"><strong aria-hidden="true">9.17.</strong> Netcode Research Alignment Audit (2026-02-27)</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="tracking/rtl-bidi-qa-corpus.html"><strong aria-hidden="true">9.18.</strong> RTL / BiDi QA Corpus (Chat, Markers, UI, Subtitles)</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="tracking/testing-strategy.html"><strong aria-hidden="true">9.19.</strong> Testing Strategy &amp; CI/CD Pipeline</a></span><ol class="section"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="tracking/testing/testing-infrastructure-subsystems.html"><strong aria-hidden="true">9.19.1.</strong> Infrastructure &amp; Subsystems</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="tracking/testing/testing-properties-misuse-integration.html"><strong aria-hidden="true">9.19.2.</strong> Properties, Misuse &amp; Integration</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="tracking/testing/testing-coverage-release.html"><strong aria-hidden="true">9.19.3.</strong> Coverage &amp; Release</a></span></li></ol></li></ol><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="09-DECISIONS.html"><strong aria-hidden="true">10.</strong> Decision Log</a></span><ol class="section"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="LLM-MODES.html"><strong aria-hidden="true">10.1.</strong> Experimental LLM Modes &amp; Plans (BYOLLM)</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/DECISION-CAPSULE-TEMPLATE.html"><strong aria-hidden="true">10.2.</strong> Decision Capsule Template (LLM/RAG)</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09a-foundation.html"><strong aria-hidden="true">10.3.</strong> Foundation &amp; Core</a></span><ol class="section"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09a/D001-rust-language.html"><strong aria-hidden="true">10.3.1.</strong> D001 — Rust Language</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09a/D002-bevy-framework.html"><strong aria-hidden="true">10.3.2.</strong> D002 — Bevy Framework</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09a/D003-yaml-data-format.html"><strong aria-hidden="true">10.3.3.</strong> D003 — Real YAML Data Format</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09a/D009-fixed-point-math.html"><strong aria-hidden="true">10.3.4.</strong> D009 — Fixed-Point Math</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09a/D010-snapshottable-state.html"><strong aria-hidden="true">10.3.5.</strong> D010 — Snapshottable State</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09a/D015-efficiency-first.html"><strong aria-hidden="true">10.3.6.</strong> D015 — Efficiency-First Performance</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09a/D017-bevy-rendering.html"><strong aria-hidden="true">10.3.7.</strong> D017 — Bevy Rendering Pipeline</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09a/D018-multi-game-extensibility.html"><strong aria-hidden="true">10.3.8.</strong> D018 — Multi-Game Extensibility</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09a/D039-engine-scope.html"><strong aria-hidden="true">10.3.9.</strong> D039 — Engine Scope</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09a/D067-config-format-split.html"><strong aria-hidden="true">10.3.10.</strong> D067 — Config Format Split</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09a/D076-standalone-crates.html"><strong aria-hidden="true">10.3.11.</strong> D076 — Standalone Crate Extraction</a></span></li></ol><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09b-networking.html"><strong aria-hidden="true">10.4.</strong> Networking &amp; Multiplayer</a></span><ol class="section"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09b/D006-pluggable-net.html"><strong aria-hidden="true">10.4.1.</strong> D006 — Pluggable via Trait</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09b/D007-relay-default.html"><strong aria-hidden="true">10.4.2.</strong> D007 — Relay Server as Default</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09b/D008-sub-tick.html"><strong aria-hidden="true">10.4.3.</strong> D008 — Sub-Tick Timestamps</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09b/D011-cross-engine.html"><strong aria-hidden="true">10.4.4.</strong> D011 — Cross-Engine Play</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09b/D012-order-validation.html"><strong aria-hidden="true">10.4.5.</strong> D012 — Validate Orders in Sim</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09b/D052-community-servers.html"><strong aria-hidden="true">10.4.6.</strong> D052 — Community Servers</a></span><ol class="section"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09b/D052/D052-overview-moderation-credentials.html"><strong aria-hidden="true">10.4.6.1.</strong> Overview, Moderation &amp; Credentials</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09b/D052/D052-credential-store-validation.html"><strong aria-hidden="true">10.4.6.2.</strong> Credential Store &amp; Validation</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09b/D052/D052-transparency-matchmaking-lobby.html"><strong aria-hidden="true">10.4.6.3.</strong> Transparency, Matchmaking &amp; Lobby</a></span><ol class="section"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09b/D052/D052-lobby-communication.html"><strong aria-hidden="true">10.4.6.3.1.</strong> Lobby Communication</a></span></li></ol><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09b/D052/D052-keys-operations-integration.html"><strong aria-hidden="true">10.4.6.4.</strong> Keys, Operations &amp; Integration</a></span></li></ol><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09b/D055-ranked-matchmaking.html"><strong aria-hidden="true">10.4.7.</strong> D055 — Ranked Matchmaking</a></span><ol class="section"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09b/D055/D055-seasons-matchmaking.html"><strong aria-hidden="true">10.4.7.1.</strong> Seasons &amp; Matchmaking</a></span></li></ol><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09b/D060-netcode-params.html"><strong aria-hidden="true">10.4.8.</strong> D060 — Netcode Parameters</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09b/D072-server-management.html"><strong aria-hidden="true">10.4.9.</strong> D072 — Server Management</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09b/D074-community-server-bundle.html"><strong aria-hidden="true">10.4.10.</strong> D074 — Community Server Bundle</a></span><ol class="section"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09b/D074/D074-federated-moderation.html"><strong aria-hidden="true">10.4.10.1.</strong> Federated Moderation</a></span></li></ol></li></ol><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09c-modding.html"><strong aria-hidden="true">10.5.</strong> Modding &amp; Compatibility</a></span><ol class="section"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09c/D004-lua-scripting.html"><strong aria-hidden="true">10.5.1.</strong> D004 — Lua Scripting</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09c/D005-wasm-mods.html"><strong aria-hidden="true">10.5.2.</strong> D005 — WASM Mods</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09c/D014-tera-templating.html"><strong aria-hidden="true">10.5.3.</strong> D014 — Tera Templating</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09c/D023-vocabulary-compat.html"><strong aria-hidden="true">10.5.4.</strong> D023 — Vocabulary Compat</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09c/D024-lua-superset.html"><strong aria-hidden="true">10.5.5.</strong> D024 — Lua API Superset</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09c/D025-miniyaml-runtime.html"><strong aria-hidden="true">10.5.6.</strong> D025 — MiniYAML Runtime</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09c/D026-mod-manifest.html"><strong aria-hidden="true">10.5.7.</strong> D026 — Mod Manifest Compat</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09c/D027-canonical-enums.html"><strong aria-hidden="true">10.5.8.</strong> D027 — Canonical Enums</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09c/D032-ui-themes.html"><strong aria-hidden="true">10.5.9.</strong> D032 — UI Themes</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09c/D050-workshop-library.html"><strong aria-hidden="true">10.5.10.</strong> D050 — Workshop Library</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09c/D051-gpl-license.html"><strong aria-hidden="true">10.5.11.</strong> D051 — GPL v3 License</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09c/D062-mod-profiles.html"><strong aria-hidden="true">10.5.12.</strong> D062 — Mod Profiles</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09c/D066-cross-engine-export.html"><strong aria-hidden="true">10.5.13.</strong> D066 — Cross-Engine Export</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09c/D068-selective-install.html"><strong aria-hidden="true">10.5.14.</strong> D068 — Selective Install</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09c/D075-remastered-format-compat.html"><strong aria-hidden="true">10.5.15.</strong> D075 — Remastered Compat</a></span></li></ol><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09d-gameplay.html"><strong aria-hidden="true">10.6.</strong> Gameplay &amp; AI</a></span><ol class="section"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09d/D013-pathfinding.html"><strong aria-hidden="true">10.6.1.</strong> D013 — Pathfinding</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09d/D019-balance-presets.html"><strong aria-hidden="true">10.6.2.</strong> D019 — Balance Presets</a></span><ol class="section"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09d/D019/D019-lua-api-integration.html"><strong aria-hidden="true">10.6.2.1.</strong> Lua API &amp; Integration</a></span></li></ol><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09d/D021-branching-campaigns.html"><strong aria-hidden="true">10.6.3.</strong> D021 — Branching Campaigns</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09d/D022-dynamic-weather.html"><strong aria-hidden="true">10.6.4.</strong> D022 — Dynamic Weather</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09d/D028-conditions-multipliers.html"><strong aria-hidden="true">10.6.5.</strong> D028 — Conditions &amp; Multipliers</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09d/D029-cross-game-components.html"><strong aria-hidden="true">10.6.6.</strong> D029 — Cross-Game Components</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09d/D033-qol-presets.html"><strong aria-hidden="true">10.6.7.</strong> D033 — QoL Presets</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09d/D041-trait-abstraction.html"><strong aria-hidden="true">10.6.8.</strong> D041 — Trait Abstraction</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09d/D042-behavioral-profiles.html"><strong aria-hidden="true">10.6.9.</strong> D042 — Behavioral Profiles</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09d/D043-ai-presets.html"><strong aria-hidden="true">10.6.10.</strong> D043 — AI Presets</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09d/D044-llm-ai.html"><strong aria-hidden="true">10.6.11.</strong> D044 — LLM-Enhanced AI</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09d/D045-pathfinding-presets.html"><strong aria-hidden="true">10.6.12.</strong> D045 — Pathfinding Presets</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09d/D048-render-modes.html"><strong aria-hidden="true">10.6.13.</strong> D048 — Render Modes</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09d/D054-extended-switchability.html"><strong aria-hidden="true">10.6.14.</strong> D054 — Extended Switchability</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09d/D070-asymmetric-coop.html"><strong aria-hidden="true">10.6.15.</strong> D070 — Asymmetric Co-op</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09d/D073-llm-exhibition-modes.html"><strong aria-hidden="true">10.6.16.</strong> D073 — LLM Exhibition Modes</a></span></li></ol><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09e-community.html"><strong aria-hidden="true">10.7.</strong> Community &amp; Platform</a></span><ol class="section"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09e/D030-workshop-registry.html"><strong aria-hidden="true">10.7.1.</strong> D030 — Workshop Registry</a></span><ol class="section"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09e/D030/D030-deployment-operations.html"><strong aria-hidden="true">10.7.1.1.</strong> Deployment &amp; Operations</a></span></li></ol><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09e/D031-observability.html"><strong aria-hidden="true">10.7.2.</strong> D031 — Observability &amp; Telemetry</a></span><ol class="section"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09e/D031/D031-analytics.html"><strong aria-hidden="true">10.7.2.1.</strong> Analytics</a></span></li></ol><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09e/D034-sqlite.html"><strong aria-hidden="true">10.7.3.</strong> D034 — SQLite Storage</a></span><ol class="section"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09e/D034/D034-pragma-operations.html"><strong aria-hidden="true">10.7.3.1.</strong> PRAGMA &amp; Operations</a></span></li></ol><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09e/D035-creator-attribution.html"><strong aria-hidden="true">10.7.4.</strong> D035 — Creator Attribution</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09e/D036-achievements.html"><strong aria-hidden="true">10.7.5.</strong> D036 — Achievements</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09e/D037-governance.html"><strong aria-hidden="true">10.7.6.</strong> D037 — Governance</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09e/D046-community-platform.html"><strong aria-hidden="true">10.7.7.</strong> D046 — Community Platform</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09e/D049-workshop-assets.html"><strong aria-hidden="true">10.7.8.</strong> D049 — Workshop Assets</a></span><ol class="section"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09e/D049/D049-package-profiles.html"><strong aria-hidden="true">10.7.8.1.</strong> Package &amp; Profiles</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09e/D049/D049-p2p-distribution.html"><strong aria-hidden="true">10.7.8.2.</strong> P2P Distribution</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09e/D049/D049-p2p-policy-admin.html"><strong aria-hidden="true">10.7.8.3.</strong> P2P Policy &amp; Admin</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09e/D049/D049-content-channels-integration.html"><strong aria-hidden="true">10.7.8.4.</strong> Content Channels Integration</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09e/D049/D049-replay-sharing.html"><strong aria-hidden="true">10.7.8.5.</strong> Replay Sharing via P2P</a></span></li></ol><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09e/D053-player-profile.html"><strong aria-hidden="true">10.7.9.</strong> D053 — Player Profile</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09e/D061-data-backup.html"><strong aria-hidden="true">10.7.10.</strong> D061 — Data Backup</a></span><ol class="section"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09e/D061/D061-player-experience.html"><strong aria-hidden="true">10.7.10.1.</strong> Player Experience</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09e/D061/D061-resilience.html"><strong aria-hidden="true">10.7.10.2.</strong> Resilience</a></span></li></ol></li></ol><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09f-tools.html"><strong aria-hidden="true">10.8.</strong> Tools &amp; Editor</a></span><ol class="section"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09f/D016-llm-missions.html"><strong aria-hidden="true">10.8.1.</strong> D016 — LLM Missions</a></span><ol class="section"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09f/D016/D016-overview-generation.html"><strong aria-hidden="true">10.8.1.1.</strong> Overview &amp; Generation</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09f/D016/D016-characters-output.html"><strong aria-hidden="true">10.8.1.2.</strong> Characters &amp; Output</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09f/D016/D016-cinematics-media.html"><strong aria-hidden="true">10.8.1.3.</strong> Cinematics &amp; Media</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09f/D016/D016-branching-world-campaigns.html"><strong aria-hidden="true">10.8.1.4.</strong> Branching &amp; World Campaigns</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09f/D016/D016-world-assets-multiplayer.html"><strong aria-hidden="true">10.8.1.5.</strong> World Assets &amp; Multiplayer</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09f/D016/D016-extensions-factions-tools.html"><strong aria-hidden="true">10.8.1.6.</strong> Extensions, Factions &amp; Tools</a></span><ol class="section"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09f/D016/D016-factions-editor-tools.html"><strong aria-hidden="true">10.8.1.6.1.</strong> Factions &amp; Editor Tools</a></span></li></ol></li></ol><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09f/D020-mod-sdk.html"><strong aria-hidden="true">10.8.2.</strong> D020 — Mod SDK</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09f/D038-scenario-editor.html"><strong aria-hidden="true">10.8.3.</strong> D038 — Scenario Editor</a></span><ol class="section"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09f/D038/D038-core-architecture.html"><strong aria-hidden="true">10.8.3.1.</strong> Core &amp; Architecture</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09f/D038/D038-triggers-waypoints.html"><strong aria-hidden="true">10.8.3.2.</strong> Triggers &amp; Waypoints</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09f/D038/D038-media-validation.html"><strong aria-hidden="true">10.8.3.3.</strong> Media &amp; Validation</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09f/D038/D038-campaign-editor.html"><strong aria-hidden="true">10.8.3.4.</strong> Campaign Editor</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09f/D038/D038-game-master-replay-multiplayer.html"><strong aria-hidden="true">10.8.3.5.</strong> Game Master, Replay &amp; Multiplayer</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09f/D038/D038-onboarding-platform-export.html"><strong aria-hidden="true">10.8.3.6.</strong> Onboarding, Platform &amp; Export</a></span></li></ol><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09f/D040-asset-studio.html"><strong aria-hidden="true">10.8.4.</strong> D040 — Asset Studio</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09f/D047-llm-config.html"><strong aria-hidden="true">10.8.5.</strong> D047 — LLM Config Manager</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09f/D056-replay-import.html"><strong aria-hidden="true">10.8.6.</strong> D056 — Replay Import</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09f/D057-llm-skill-library.html"><strong aria-hidden="true">10.8.7.</strong> D057 — LLM Skill Library</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09f/D071-external-tool-api.html"><strong aria-hidden="true">10.8.8.</strong> D071 — External Tool API (ICRP)</a></span></li></ol><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09g-interaction.html"><strong aria-hidden="true">10.9.</strong> In-Game Interaction</a></span><ol class="section"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09g/D058-command-console.html"><strong aria-hidden="true">10.9.1.</strong> D058 — Command Console</a></span><ol class="section"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09g/D058/D058-overview-architecture.html"><strong aria-hidden="true">10.9.1.1.</strong> Overview &amp; Architecture</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09g/D058/D058-commands-catalog.html"><strong aria-hidden="true">10.9.1.2.</strong> Commands &amp; Catalog</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09g/D058/D058-competitive-cheats-integration.html"><strong aria-hidden="true">10.9.1.3.</strong> Competitive, Cheats &amp; Integration</a></span><ol class="section"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09g/D058/D058-cheats-config.html"><strong aria-hidden="true">10.9.1.3.1.</strong> Cheats, Config &amp; Integration</a></span></li></ol></li></ol><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09g/D059-communication.html"><strong aria-hidden="true">10.9.2.</strong> D059 — Communication</a></span><ol class="section"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09g/D059/D059-overview-text-chat-voip-core.html"><strong aria-hidden="true">10.9.2.1.</strong> Overview, Text Chat &amp; VoIP Core</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09g/D059/D059-voip-relay-moderation.html"><strong aria-hidden="true">10.9.2.2.</strong> VoIP Relay &amp; Moderation</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09g/D059/D059-voip-effects-ecs.html"><strong aria-hidden="true">10.9.2.3.</strong> VoIP Effects &amp; ECS</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09g/D059/D059-beacons-coordination.html"><strong aria-hidden="true">10.9.2.4.</strong> Beacons &amp; Coordination</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09g/D059/D059-replay-requests-integration.html"><strong aria-hidden="true">10.9.2.5.</strong> Replay, Requests &amp; Integration</a></span></li></ol><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09g/D065-tutorial.html"><strong aria-hidden="true">10.9.3.</strong> D065 — Tutorial</a></span><ol class="section"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09g/D065/D065-overview-commander-school.html"><strong aria-hidden="true">10.9.3.1.</strong> Overview &amp; Commander School</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09g/D065/D065-hints-schema.html"><strong aria-hidden="true">10.9.3.2.</strong> Hints Schema</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09g/D065/D065-hints-tips-triggers.html"><strong aria-hidden="true">10.9.3.3.</strong> Hints, Tips &amp; Triggers</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09g/D065/D065-new-player-pacing.html"><strong aria-hidden="true">10.9.3.4.</strong> New Player Pipeline &amp; Pacing</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09g/D065/D065-postgame-api-integration.html"><strong aria-hidden="true">10.9.3.5.</strong> Post-Game, API &amp; Integration</a></span></li></ol><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09g/D069-install-wizard.html"><strong aria-hidden="true">10.9.4.</strong> D069 — Install Wizard</a></span></li></ol></li></ol><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="10-PERFORMANCE.html"><strong aria-hidden="true">11.</strong> Performance Philosophy</a></span><ol class="section"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="performance/efficiency-pyramid.html"><strong aria-hidden="true">11.1.</strong> Efficiency Pyramid</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="performance/targets.html"><strong aria-hidden="true">11.2.</strong> Targets &amp; Comparisons</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="performance/gpu-hardware.html"><strong aria-hidden="true">11.3.</strong> GPU &amp; Hardware Compatibility</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="performance/profiling.html"><strong aria-hidden="true">11.4.</strong> Profiling &amp; Regression</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="performance/delta-encoding.html"><strong aria-hidden="true">11.5.</strong> Delta Encoding &amp; Invariants</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="performance/ram-mode.html"><strong aria-hidden="true">11.6.</strong> RAM Mode</a></span></li></ol><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="11-OPENRA-FEATURES.html"><strong aria-hidden="true">12.</strong> OpenRA Feature Reference &amp; Gap Analysis</a></span><ol class="section"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="openra-features/core-architecture.html"><strong aria-hidden="true">12.1.</strong> Core Architecture (§1–5)</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="openra-features/combat-rendering.html"><strong aria-hidden="true">12.2.</strong> Combat &amp; Rendering (§6–16)</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="openra-features/movement-terrain-maps.html"><strong aria-hidden="true">12.3.</strong> Movement, Terrain &amp; Maps (§17–23)</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="openra-features/ui-input-systems.html"><strong aria-hidden="true">12.4.</strong> UI, Input &amp; Scripting (§24–27)</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="openra-features/player-game-state.html"><strong aria-hidden="true">12.5.</strong> Player, Game State &amp; Infrastructure (§28–39)</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="openra-features/gap-analysis.html"><strong aria-hidden="true">12.6.</strong> Gap Analysis (§1–39)</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="openra-features/ic-advantages-mapping.html"><strong aria-hidden="true">12.7.</strong> IC Advantages &amp; Mapping</a></span></li></ol><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="12-MOD-MIGRATION.html"><strong aria-hidden="true">13.</strong> Mod Migration Case Studies</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="13-PHILOSOPHY.html"><strong aria-hidden="true">14.</strong> Development Philosophy</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="14-METHODOLOGY.html"><strong aria-hidden="true">15.</strong> Development Methodology</a></span><ol class="section"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="methodology/research-rigor.html"><strong aria-hidden="true">15.1.</strong> Research Rigor</a></span></li></ol><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="15-SERVER-GUIDE.html"><strong aria-hidden="true">16.</strong> Server Administration Guide</a></span><ol class="section"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="server-guide/operations.html"><strong aria-hidden="true">16.1.</strong> Operations</a></span></li></ol><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="16-CODING-STANDARDS.html"><strong aria-hidden="true">17.</strong> Coding Standards</a></span><ol class="section"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="coding-standards/quality-review.html"><strong aria-hidden="true">17.1.</strong> Quality &amp; Review</a></span></li></ol><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="17-PLAYER-FLOW.html"><strong aria-hidden="true">18.</strong> Player Flow &amp; UI Navigation</a></span><ol class="section"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="player-flow/first-launch.html"><strong aria-hidden="true">18.1.</strong> First Launch Flow</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="player-flow/main-menu.html"><strong aria-hidden="true">18.2.</strong> Main Menu</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="player-flow/single-player.html"><strong aria-hidden="true">18.3.</strong> Single Player</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="player-flow/multiplayer.html"><strong aria-hidden="true">18.4.</strong> Multiplayer</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="player-flow/network-experience.html"><strong aria-hidden="true">18.5.</strong> Network Experience Guide</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="player-flow/in-game.html"><strong aria-hidden="true">18.6.</strong> In-Game</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="player-flow/post-game.html"><strong aria-hidden="true">18.7.</strong> Post-Game</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="player-flow/replays.html"><strong aria-hidden="true">18.8.</strong> Replays</a></span><ol class="section"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="player-flow/replays-analysis-sharing.html"><strong aria-hidden="true">18.8.1.</strong> Analysis, Sharing &amp; Tools</a></span></li></ol><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="player-flow/workshop.html"><strong aria-hidden="true">18.9.</strong> Workshop</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="player-flow/settings.html"><strong aria-hidden="true">18.10.</strong> Settings</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="player-flow/llm-setup-guide.html"><strong aria-hidden="true">18.11.</strong> LLM Provider Setup Guide</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="player-flow/player-profile.html"><strong aria-hidden="true">18.12.</strong> Player Profile</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="player-flow/encyclopedia.html"><strong aria-hidden="true">18.13.</strong> Encyclopedia</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="player-flow/tutorial.html"><strong aria-hidden="true">18.14.</strong> Tutorial &amp; New Player Experience</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="player-flow/sdk.html"><strong aria-hidden="true">18.15.</strong> IC SDK (Separate Application)</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="player-flow/reference-ui.html"><strong aria-hidden="true">18.16.</strong> Reference Game UI Analysis</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="player-flow/flow-comparison.html"><strong aria-hidden="true">18.17.</strong> Flow Comparison: Classic RA vs. Iron Curtain</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="player-flow/platform-adaptations.html"><strong aria-hidden="true">18.18.</strong> Platform Adaptations</a></span></li></ol></li></ol>';
        // Set the current, active page, and reveal it if it's hidden
        let current_page = document.location.href.toString().split('#')[0].split('?')[0];
        if (current_page.endsWith('/')) {
            current_page += 'index.html';
        }
        const links = Array.prototype.slice.call(this.querySelectorAll('a'));
        const l = links.length;
        for (let i = 0; i < l; ++i) {
            const link = links[i];
            const href = link.getAttribute('href');
            if (href && !href.startsWith('#') && !/^(?:[a-z+]+:)?\/\//.test(href)) {
                link.href = path_to_root + href;
            }
            // The 'index' page is supposed to alias the first chapter in the book.
            if (link.href === current_page
                || i === 0
                && path_to_root === ''
                && current_page.endsWith('/index.html')) {
                link.classList.add('active');
                let parent = link.parentElement;
                while (parent) {
                    if (parent.tagName === 'LI' && parent.classList.contains('chapter-item')) {
                        parent.classList.add('expanded');
                    }
                    parent = parent.parentElement;
                }
            }
        }
        // Track and set sidebar scroll position
        this.addEventListener('click', e => {
            if (e.target.tagName === 'A') {
                const clientRect = e.target.getBoundingClientRect();
                const sidebarRect = this.getBoundingClientRect();
                sessionStorage.setItem('sidebar-scroll-offset', clientRect.top - sidebarRect.top);
            }
        }, { passive: true });
        const sidebarScrollOffset = sessionStorage.getItem('sidebar-scroll-offset');
        sessionStorage.removeItem('sidebar-scroll-offset');
        if (sidebarScrollOffset !== null) {
            // preserve sidebar scroll position when navigating via links within sidebar
            const activeSection = this.querySelector('.active');
            if (activeSection) {
                const clientRect = activeSection.getBoundingClientRect();
                const sidebarRect = this.getBoundingClientRect();
                const currentOffset = clientRect.top - sidebarRect.top;
                this.scrollTop += currentOffset - parseFloat(sidebarScrollOffset);
            }
        } else {
            // scroll sidebar to current active section when navigating via
            // 'next/previous chapter' buttons
            const activeSection = document.querySelector('#mdbook-sidebar .active');
            if (activeSection) {
                activeSection.scrollIntoView({ block: 'center' });
            }
        }
        // Toggle buttons
        const sidebarAnchorToggles = document.querySelectorAll('.chapter-fold-toggle');
        function toggleSection(ev) {
            ev.currentTarget.parentElement.parentElement.classList.toggle('expanded');
        }
        Array.from(sidebarAnchorToggles).forEach(el => {
            el.addEventListener('click', toggleSection);
        });
    }
}
window.customElements.define('mdbook-sidebar-scrollbox', MDBookSidebarScrollbox);


// ---------------------------------------------------------------------------
// Support for dynamically adding headers to the sidebar.

(function() {
    // This is used to detect which direction the page has scrolled since the
    // last scroll event.
    let lastKnownScrollPosition = 0;
    // This is the threshold in px from the top of the screen where it will
    // consider a header the "current" header when scrolling down.
    const defaultDownThreshold = 150;
    // Same as defaultDownThreshold, except when scrolling up.
    const defaultUpThreshold = 300;
    // The threshold is a virtual horizontal line on the screen where it
    // considers the "current" header to be above the line. The threshold is
    // modified dynamically to handle headers that are near the bottom of the
    // screen, and to slightly offset the behavior when scrolling up vs down.
    let threshold = defaultDownThreshold;
    // This is used to disable updates while scrolling. This is needed when
    // clicking the header in the sidebar, which triggers a scroll event. It
    // is somewhat finicky to detect when the scroll has finished, so this
    // uses a relatively dumb system of disabling scroll updates for a short
    // time after the click.
    let disableScroll = false;
    // Array of header elements on the page.
    let headers;
    // Array of li elements that are initially collapsed headers in the sidebar.
    // I'm not sure why eslint seems to have a false positive here.
    // eslint-disable-next-line prefer-const
    let headerToggles = [];
    // This is a debugging tool for the threshold which you can enable in the console.
    let thresholdDebug = false;

    // Updates the threshold based on the scroll position.
    function updateThreshold() {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const windowHeight = window.innerHeight;
        const documentHeight = document.documentElement.scrollHeight;

        // The number of pixels below the viewport, at most documentHeight.
        // This is used to push the threshold down to the bottom of the page
        // as the user scrolls towards the bottom.
        const pixelsBelow = Math.max(0, documentHeight - (scrollTop + windowHeight));
        // The number of pixels above the viewport, at least defaultDownThreshold.
        // Similar to pixelsBelow, this is used to push the threshold back towards
        // the top when reaching the top of the page.
        const pixelsAbove = Math.max(0, defaultDownThreshold - scrollTop);
        // How much the threshold should be offset once it gets close to the
        // bottom of the page.
        const bottomAdd = Math.max(0, windowHeight - pixelsBelow - defaultDownThreshold);
        let adjustedBottomAdd = bottomAdd;

        // Adjusts bottomAdd for a small document. The calculation above
        // assumes the document is at least twice the windowheight in size. If
        // it is less than that, then bottomAdd needs to be shrunk
        // proportional to the difference in size.
        if (documentHeight < windowHeight * 2) {
            const maxPixelsBelow = documentHeight - windowHeight;
            const t = 1 - pixelsBelow / Math.max(1, maxPixelsBelow);
            const clamp = Math.max(0, Math.min(1, t));
            adjustedBottomAdd *= clamp;
        }

        let scrollingDown = true;
        if (scrollTop < lastKnownScrollPosition) {
            scrollingDown = false;
        }

        if (scrollingDown) {
            // When scrolling down, move the threshold up towards the default
            // downwards threshold position. If near the bottom of the page,
            // adjustedBottomAdd will offset the threshold towards the bottom
            // of the page.
            const amountScrolledDown = scrollTop - lastKnownScrollPosition;
            const adjustedDefault = defaultDownThreshold + adjustedBottomAdd;
            threshold = Math.max(adjustedDefault, threshold - amountScrolledDown);
        } else {
            // When scrolling up, move the threshold down towards the default
            // upwards threshold position. If near the bottom of the page,
            // quickly transition the threshold back up where it normally
            // belongs.
            const amountScrolledUp = lastKnownScrollPosition - scrollTop;
            const adjustedDefault = defaultUpThreshold - pixelsAbove
                + Math.max(0, adjustedBottomAdd - defaultDownThreshold);
            threshold = Math.min(adjustedDefault, threshold + amountScrolledUp);
        }

        if (documentHeight <= windowHeight) {
            threshold = 0;
        }

        if (thresholdDebug) {
            const id = 'mdbook-threshold-debug-data';
            let data = document.getElementById(id);
            if (data === null) {
                data = document.createElement('div');
                data.id = id;
                data.style.cssText = `
                    position: fixed;
                    top: 50px;
                    right: 10px;
                    background-color: 0xeeeeee;
                    z-index: 9999;
                    pointer-events: none;
                `;
                document.body.appendChild(data);
            }
            data.innerHTML = `
                <table>
                  <tr><td>documentHeight</td><td>${documentHeight.toFixed(1)}</td></tr>
                  <tr><td>windowHeight</td><td>${windowHeight.toFixed(1)}</td></tr>
                  <tr><td>scrollTop</td><td>${scrollTop.toFixed(1)}</td></tr>
                  <tr><td>pixelsAbove</td><td>${pixelsAbove.toFixed(1)}</td></tr>
                  <tr><td>pixelsBelow</td><td>${pixelsBelow.toFixed(1)}</td></tr>
                  <tr><td>bottomAdd</td><td>${bottomAdd.toFixed(1)}</td></tr>
                  <tr><td>adjustedBottomAdd</td><td>${adjustedBottomAdd.toFixed(1)}</td></tr>
                  <tr><td>scrollingDown</td><td>${scrollingDown}</td></tr>
                  <tr><td>threshold</td><td>${threshold.toFixed(1)}</td></tr>
                </table>
            `;
            drawDebugLine();
        }

        lastKnownScrollPosition = scrollTop;
    }

    function drawDebugLine() {
        if (!document.body) {
            return;
        }
        const id = 'mdbook-threshold-debug-line';
        const existingLine = document.getElementById(id);
        if (existingLine) {
            existingLine.remove();
        }
        const line = document.createElement('div');
        line.id = id;
        line.style.cssText = `
            position: fixed;
            top: ${threshold}px;
            left: 0;
            width: 100vw;
            height: 2px;
            background-color: red;
            z-index: 9999;
            pointer-events: none;
        `;
        document.body.appendChild(line);
    }

    function mdbookEnableThresholdDebug() {
        thresholdDebug = true;
        updateThreshold();
        drawDebugLine();
    }

    window.mdbookEnableThresholdDebug = mdbookEnableThresholdDebug;

    // Updates which headers in the sidebar should be expanded. If the current
    // header is inside a collapsed group, then it, and all its parents should
    // be expanded.
    function updateHeaderExpanded(currentA) {
        // Add expanded to all header-item li ancestors.
        let current = currentA.parentElement;
        while (current) {
            if (current.tagName === 'LI' && current.classList.contains('header-item')) {
                current.classList.add('expanded');
            }
            current = current.parentElement;
        }
    }

    // Updates which header is marked as the "current" header in the sidebar.
    // This is done with a virtual Y threshold, where headers at or below
    // that line will be considered the current one.
    function updateCurrentHeader() {
        if (!headers || !headers.length) {
            return;
        }

        // Reset the classes, which will be rebuilt below.
        const els = document.getElementsByClassName('current-header');
        for (const el of els) {
            el.classList.remove('current-header');
        }
        for (const toggle of headerToggles) {
            toggle.classList.remove('expanded');
        }

        // Find the last header that is above the threshold.
        let lastHeader = null;
        for (const header of headers) {
            const rect = header.getBoundingClientRect();
            if (rect.top <= threshold) {
                lastHeader = header;
            } else {
                break;
            }
        }
        if (lastHeader === null) {
            lastHeader = headers[0];
            const rect = lastHeader.getBoundingClientRect();
            const windowHeight = window.innerHeight;
            if (rect.top >= windowHeight) {
                return;
            }
        }

        // Get the anchor in the summary.
        const href = '#' + lastHeader.id;
        const a = [...document.querySelectorAll('.header-in-summary')]
            .find(element => element.getAttribute('href') === href);
        if (!a) {
            return;
        }

        a.classList.add('current-header');

        updateHeaderExpanded(a);
    }

    // Updates which header is "current" based on the threshold line.
    function reloadCurrentHeader() {
        if (disableScroll) {
            return;
        }
        updateThreshold();
        updateCurrentHeader();
    }


    // When clicking on a header in the sidebar, this adjusts the threshold so
    // that it is located next to the header. This is so that header becomes
    // "current".
    function headerThresholdClick(event) {
        // See disableScroll description why this is done.
        disableScroll = true;
        setTimeout(() => {
            disableScroll = false;
        }, 100);
        // requestAnimationFrame is used to delay the update of the "current"
        // header until after the scroll is done, and the header is in the new
        // position.
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                // Closest is needed because if it has child elements like <code>.
                const a = event.target.closest('a');
                const href = a.getAttribute('href');
                const targetId = href.substring(1);
                const targetElement = document.getElementById(targetId);
                if (targetElement) {
                    threshold = targetElement.getBoundingClientRect().bottom;
                    updateCurrentHeader();
                }
            });
        });
    }

    // Takes the nodes from the given head and copies them over to the
    // destination, along with some filtering.
    function filterHeader(source, dest) {
        const clone = source.cloneNode(true);
        clone.querySelectorAll('mark').forEach(mark => {
            mark.replaceWith(...mark.childNodes);
        });
        dest.append(...clone.childNodes);
    }

    // Scans page for headers and adds them to the sidebar.
    document.addEventListener('DOMContentLoaded', function() {
        const activeSection = document.querySelector('#mdbook-sidebar .active');
        if (activeSection === null) {
            return;
        }

        const main = document.getElementsByTagName('main')[0];
        headers = Array.from(main.querySelectorAll('h2, h3, h4, h5, h6'))
            .filter(h => h.id !== '' && h.children.length && h.children[0].tagName === 'A');

        if (headers.length === 0) {
            return;
        }

        // Build a tree of headers in the sidebar.

        const stack = [];

        const firstLevel = parseInt(headers[0].tagName.charAt(1));
        for (let i = 1; i < firstLevel; i++) {
            const ol = document.createElement('ol');
            ol.classList.add('section');
            if (stack.length > 0) {
                stack[stack.length - 1].ol.appendChild(ol);
            }
            stack.push({level: i + 1, ol: ol});
        }

        // The level where it will start folding deeply nested headers.
        const foldLevel = 3;

        for (let i = 0; i < headers.length; i++) {
            const header = headers[i];
            const level = parseInt(header.tagName.charAt(1));

            const currentLevel = stack[stack.length - 1].level;
            if (level > currentLevel) {
                // Begin nesting to this level.
                for (let nextLevel = currentLevel + 1; nextLevel <= level; nextLevel++) {
                    const ol = document.createElement('ol');
                    ol.classList.add('section');
                    const last = stack[stack.length - 1];
                    const lastChild = last.ol.lastChild;
                    // Handle the case where jumping more than one nesting
                    // level, which doesn't have a list item to place this new
                    // list inside of.
                    if (lastChild) {
                        lastChild.appendChild(ol);
                    } else {
                        last.ol.appendChild(ol);
                    }
                    stack.push({level: nextLevel, ol: ol});
                }
            } else if (level < currentLevel) {
                while (stack.length > 1 && stack[stack.length - 1].level > level) {
                    stack.pop();
                }
            }

            const li = document.createElement('li');
            li.classList.add('header-item');
            li.classList.add('expanded');
            if (level < foldLevel) {
                li.classList.add('expanded');
            }
            const span = document.createElement('span');
            span.classList.add('chapter-link-wrapper');
            const a = document.createElement('a');
            span.appendChild(a);
            a.href = '#' + header.id;
            a.classList.add('header-in-summary');
            filterHeader(header.children[0], a);
            a.addEventListener('click', headerThresholdClick);
            const nextHeader = headers[i + 1];
            if (nextHeader !== undefined) {
                const nextLevel = parseInt(nextHeader.tagName.charAt(1));
                if (nextLevel > level && level >= foldLevel) {
                    const toggle = document.createElement('a');
                    toggle.classList.add('chapter-fold-toggle');
                    toggle.classList.add('header-toggle');
                    toggle.addEventListener('click', () => {
                        li.classList.toggle('expanded');
                    });
                    const toggleDiv = document.createElement('div');
                    toggleDiv.textContent = '❱';
                    toggle.appendChild(toggleDiv);
                    span.appendChild(toggle);
                    headerToggles.push(li);
                }
            }
            li.appendChild(span);

            const currentParent = stack[stack.length - 1];
            currentParent.ol.appendChild(li);
        }

        const onThisPage = document.createElement('div');
        onThisPage.classList.add('on-this-page');
        onThisPage.append(stack[0].ol);
        const activeItemSpan = activeSection.parentElement;
        activeItemSpan.after(onThisPage);
    });

    document.addEventListener('DOMContentLoaded', reloadCurrentHeader);
    document.addEventListener('scroll', reloadCurrentHeader, { passive: true });
})();

