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
        this.innerHTML = '<ol class="chapter"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="00-INDEX.html">Introduction</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="FOREWORD.html">Foreword — Why I&#39;m Building This</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="OVERVIEW.html">What Iron Curtain Offers</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="LLM-INDEX.html">LLM / RAG Retrieval Index</a></span></li><li class="chapter-item expanded "><li class="spacer"></li></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="01-VISION.html"><strong aria-hidden="true">1.</strong> Vision &amp; Competitive Landscape</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="02-ARCHITECTURE.html"><strong aria-hidden="true">2.</strong> Core Architecture</a></span><ol class="section"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="architecture/gameplay-systems.html"><strong aria-hidden="true">2.1.</strong> Extended Gameplay Systems (RA1)</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="architecture/game-loop.html"><strong aria-hidden="true">2.2.</strong> Game Loop</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="architecture/state-recording.html"><strong aria-hidden="true">2.3.</strong> State Recording &amp; Replay Infrastructure</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="architecture/pathfinding.html"><strong aria-hidden="true">2.4.</strong> Pathfinding &amp; Spatial Queries</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="architecture/platform-portability.html"><strong aria-hidden="true">2.5.</strong> Platform Portability</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="architecture/ui-theme.html"><strong aria-hidden="true">2.6.</strong> UI Theme System (D032)</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="architecture/qol-toggles.html"><strong aria-hidden="true">2.7.</strong> QoL &amp; Gameplay Behavior Toggles (D033)</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="architecture/ra-experience.html"><strong aria-hidden="true">2.8.</strong> Red Alert Experience Recreation Strategy</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="architecture/first-runnable.html"><strong aria-hidden="true">2.9.</strong> First Runnable — Bevy Loading RA Resources</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="architecture/crate-graph.html"><strong aria-hidden="true">2.10.</strong> Crate Dependency Graph</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="architecture/install-layout.html"><strong aria-hidden="true">2.11.</strong> Install &amp; Source Layout</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="architecture/sdk-editor.html"><strong aria-hidden="true">2.12.</strong> IC SDK &amp; Editor Architecture (D038 + D040)</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="architecture/multi-game.html"><strong aria-hidden="true">2.13.</strong> Multi-Game Extensibility (Game Modules)</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="architecture/type-safety.html"><strong aria-hidden="true">2.14.</strong> Type-Safety Architectural Invariants</a></span></li></ol><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="03-NETCODE.html"><strong aria-hidden="true">3.</strong> Network Architecture</a></span><ol class="section"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="netcode/match-lifecycle.html"><strong aria-hidden="true">3.1.</strong> Match Lifecycle</a></span></li></ol><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="04-MODDING.html"><strong aria-hidden="true">4.</strong> Modding System</a></span><ol class="section"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="modding/campaigns.html"><strong aria-hidden="true">4.1.</strong> Campaign System</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="modding/workshop.html"><strong aria-hidden="true">4.2.</strong> Workshop</a></span></li></ol><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="05-FORMATS.html"><strong aria-hidden="true">5.</strong> File Formats &amp; Source Insights</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="06-SECURITY.html"><strong aria-hidden="true">6.</strong> Security &amp; Threat Model</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="07-CROSS-ENGINE.html"><strong aria-hidden="true">7.</strong> Cross-Engine Compatibility</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="08-ROADMAP.html"><strong aria-hidden="true">8.</strong> Development Roadmap</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="18-PROJECT-TRACKER.html"><strong aria-hidden="true">9.</strong> Project Tracker &amp; Implementation Planning</a></span><ol class="section"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="tracking/milestone-dependency-map.html"><strong aria-hidden="true">9.1.</strong> Milestone Dependency Map</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="tracking/project-tracker-schema.html"><strong aria-hidden="true">9.2.</strong> Project Tracker Automation Companion (Optional Schema/YAML Reference)</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="tracking/implementation-ticket-template.html"><strong aria-hidden="true">9.3.</strong> Implementation Ticket Template (G-Step Aligned)</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="tracking/future-language-audit.html"><strong aria-hidden="true">9.4.</strong> Future / Deferral Language Audit</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="tracking/deferral-wording-patterns.html"><strong aria-hidden="true">9.5.</strong> Deferral Wording Patterns</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="tracking/external-code-project-bootstrap.html"><strong aria-hidden="true">9.6.</strong> External Code Project Bootstrap (Design-Aligned)</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="tracking/external-project-agents-template.html"><strong aria-hidden="true">9.7.</strong> External Project AGENTS.md Template</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="tracking/source-code-index-template.html"><strong aria-hidden="true">9.8.</strong> Source Code Index Template (Human + LLM)</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="tracking/rtl-bidi-qa-corpus.html"><strong aria-hidden="true">9.9.</strong> RTL / BiDi QA Corpus (Chat, Markers, UI, Subtitles)</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="tracking/testing-strategy.html"><strong aria-hidden="true">9.10.</strong> Testing Strategy &amp; CI/CD Pipeline</a></span></li></ol><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="09-DECISIONS.html"><strong aria-hidden="true">10.</strong> Decision Log</a></span><ol class="section"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/DECISION-CAPSULE-TEMPLATE.html"><strong aria-hidden="true">10.1.</strong> Decision Capsule Template (LLM/RAG)</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09a-foundation.html"><strong aria-hidden="true">10.2.</strong> Foundation &amp; Core</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09b-networking.html"><strong aria-hidden="true">10.3.</strong> Networking &amp; Multiplayer</a></span><ol class="section"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09b/D006-pluggable-net.html"><strong aria-hidden="true">10.3.1.</strong> D006 — Pluggable via Trait</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09b/D007-relay-default.html"><strong aria-hidden="true">10.3.2.</strong> D007 — Relay Server as Default</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09b/D008-sub-tick.html"><strong aria-hidden="true">10.3.3.</strong> D008 — Sub-Tick Timestamps</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09b/D011-cross-engine.html"><strong aria-hidden="true">10.3.4.</strong> D011 — Cross-Engine Play</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09b/D012-order-validation.html"><strong aria-hidden="true">10.3.5.</strong> D012 — Validate Orders in Sim</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09b/D052-community-servers.html"><strong aria-hidden="true">10.3.6.</strong> D052 — Community Servers</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09b/D055-ranked-matchmaking.html"><strong aria-hidden="true">10.3.7.</strong> D055 — Ranked Matchmaking</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09b/D060-netcode-params.html"><strong aria-hidden="true">10.3.8.</strong> D060 — Netcode Parameters</a></span></li></ol><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09c-modding.html"><strong aria-hidden="true">10.4.</strong> Modding &amp; Compatibility</a></span><ol class="section"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09c/D023-vocabulary-compat.html"><strong aria-hidden="true">10.4.1.</strong> D023 — Vocabulary Compat</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09c/D024-lua-superset.html"><strong aria-hidden="true">10.4.2.</strong> D024 — Lua API Superset</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09c/D025-miniyaml-runtime.html"><strong aria-hidden="true">10.4.3.</strong> D025 — MiniYAML Runtime</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09c/D026-mod-manifest.html"><strong aria-hidden="true">10.4.4.</strong> D026 — Mod Manifest Compat</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09c/D027-canonical-enums.html"><strong aria-hidden="true">10.4.5.</strong> D027 — Canonical Enums</a></span></li></ol><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09d-gameplay.html"><strong aria-hidden="true">10.5.</strong> Gameplay &amp; AI</a></span><ol class="section"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09d/D013-pathfinding.html"><strong aria-hidden="true">10.5.1.</strong> D013 — Pathfinding</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09d/D019-balance-presets.html"><strong aria-hidden="true">10.5.2.</strong> D019 — Balance Presets</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09d/D021-branching-campaigns.html"><strong aria-hidden="true">10.5.3.</strong> D021 — Branching Campaigns</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09d/D022-dynamic-weather.html"><strong aria-hidden="true">10.5.4.</strong> D022 — Dynamic Weather</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09d/D028-conditions-multipliers.html"><strong aria-hidden="true">10.5.5.</strong> D028 — Conditions &amp; Multipliers</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09d/D029-cross-game-components.html"><strong aria-hidden="true">10.5.6.</strong> D029 — Cross-Game Components</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09d/D033-qol-presets.html"><strong aria-hidden="true">10.5.7.</strong> D033 — QoL Presets</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09d/D041-trait-abstraction.html"><strong aria-hidden="true">10.5.8.</strong> D041 — Trait Abstraction</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09d/D042-behavioral-profiles.html"><strong aria-hidden="true">10.5.9.</strong> D042 — Behavioral Profiles</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09d/D043-ai-presets.html"><strong aria-hidden="true">10.5.10.</strong> D043 — AI Presets</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09d/D044-llm-ai.html"><strong aria-hidden="true">10.5.11.</strong> D044 — LLM-Enhanced AI</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09d/D045-pathfinding-presets.html"><strong aria-hidden="true">10.5.12.</strong> D045 — Pathfinding Presets</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09d/D048-render-modes.html"><strong aria-hidden="true">10.5.13.</strong> D048 — Render Modes</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09d/D054-extended-switchability.html"><strong aria-hidden="true">10.5.14.</strong> D054 — Extended Switchability</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09d/D070-asymmetric-coop.html"><strong aria-hidden="true">10.5.15.</strong> D070 — Asymmetric Co-op</a></span></li></ol><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09e-community.html"><strong aria-hidden="true">10.6.</strong> Community &amp; Platform</a></span><ol class="section"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09e/D030-workshop-registry.html"><strong aria-hidden="true">10.6.1.</strong> D030 — Workshop Registry</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09e/D031-observability.html"><strong aria-hidden="true">10.6.2.</strong> D031 — Observability &amp; Telemetry</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09e/D034-sqlite.html"><strong aria-hidden="true">10.6.3.</strong> D034 — SQLite Storage</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09e/D035-creator-attribution.html"><strong aria-hidden="true">10.6.4.</strong> D035 — Creator Attribution</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09e/D036-achievements.html"><strong aria-hidden="true">10.6.5.</strong> D036 — Achievements</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09e/D037-governance.html"><strong aria-hidden="true">10.6.6.</strong> D037 — Governance</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09e/D046-community-platform.html"><strong aria-hidden="true">10.6.7.</strong> D046 — Community Platform</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09e/D049-workshop-assets.html"><strong aria-hidden="true">10.6.8.</strong> D049 — Workshop Assets</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09e/D053-player-profile.html"><strong aria-hidden="true">10.6.9.</strong> D053 — Player Profile</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09e/D061-data-backup.html"><strong aria-hidden="true">10.6.10.</strong> D061 — Data Backup</a></span></li></ol><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09f-tools.html"><strong aria-hidden="true">10.7.</strong> Tools &amp; Editor</a></span><ol class="section"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09f/D016-llm-missions.html"><strong aria-hidden="true">10.7.1.</strong> D016 — LLM Missions</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09f/D020-mod-sdk.html"><strong aria-hidden="true">10.7.2.</strong> D020 — Mod SDK</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09f/D038-scenario-editor.html"><strong aria-hidden="true">10.7.3.</strong> D038 — Scenario Editor</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09f/D040-asset-studio.html"><strong aria-hidden="true">10.7.4.</strong> D040 — Asset Studio</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09f/D047-llm-config.html"><strong aria-hidden="true">10.7.5.</strong> D047 — LLM Config Manager</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09f/D056-replay-import.html"><strong aria-hidden="true">10.7.6.</strong> D056 — Replay Import</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09f/D057-llm-skill-library.html"><strong aria-hidden="true">10.7.7.</strong> D057 — LLM Skill Library</a></span></li></ol><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09g-interaction.html"><strong aria-hidden="true">10.8.</strong> In-Game Interaction</a></span><ol class="section"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09g/D058-command-console.html"><strong aria-hidden="true">10.8.1.</strong> D058 — Command Console</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09g/D059-communication.html"><strong aria-hidden="true">10.8.2.</strong> D059 — Communication</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09g/D065-tutorial.html"><strong aria-hidden="true">10.8.3.</strong> D065 — Tutorial</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="decisions/09g/D069-install-wizard.html"><strong aria-hidden="true">10.8.4.</strong> D069 — Install Wizard</a></span></li></ol></li></ol><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="10-PERFORMANCE.html"><strong aria-hidden="true">11.</strong> Performance Philosophy</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="11-OPENRA-FEATURES.html"><strong aria-hidden="true">12.</strong> OpenRA Feature Reference &amp; Gap Analysis</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="12-MOD-MIGRATION.html"><strong aria-hidden="true">13.</strong> Mod Migration Case Studies</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="13-PHILOSOPHY.html"><strong aria-hidden="true">14.</strong> Development Philosophy</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="14-METHODOLOGY.html"><strong aria-hidden="true">15.</strong> Development Methodology</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="15-SERVER-GUIDE.html"><strong aria-hidden="true">16.</strong> Server Administration Guide</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="16-CODING-STANDARDS.html"><strong aria-hidden="true">17.</strong> Coding Standards</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="17-PLAYER-FLOW.html"><strong aria-hidden="true">18.</strong> Player Flow &amp; UI Navigation</a></span><ol class="section"><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="player-flow/first-launch.html"><strong aria-hidden="true">18.1.</strong> First Launch Flow</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="player-flow/main-menu.html"><strong aria-hidden="true">18.2.</strong> Main Menu</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="player-flow/single-player.html"><strong aria-hidden="true">18.3.</strong> Single Player</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="player-flow/multiplayer.html"><strong aria-hidden="true">18.4.</strong> Multiplayer</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="player-flow/in-game.html"><strong aria-hidden="true">18.5.</strong> In-Game</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="player-flow/post-game.html"><strong aria-hidden="true">18.6.</strong> Post-Game</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="player-flow/replays.html"><strong aria-hidden="true">18.7.</strong> Replays</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="player-flow/workshop.html"><strong aria-hidden="true">18.8.</strong> Workshop</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="player-flow/settings.html"><strong aria-hidden="true">18.9.</strong> Settings</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="player-flow/player-profile.html"><strong aria-hidden="true">18.10.</strong> Player Profile</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="player-flow/encyclopedia.html"><strong aria-hidden="true">18.11.</strong> Encyclopedia</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="player-flow/tutorial.html"><strong aria-hidden="true">18.12.</strong> Tutorial &amp; New Player Experience</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="player-flow/sdk.html"><strong aria-hidden="true">18.13.</strong> IC SDK (Separate Application)</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="player-flow/reference-ui.html"><strong aria-hidden="true">18.14.</strong> Reference Game UI Analysis</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="player-flow/flow-comparison.html"><strong aria-hidden="true">18.15.</strong> Flow Comparison: Classic RA vs. Iron Curtain</a></span></li><li class="chapter-item expanded "><span class="chapter-link-wrapper"><a href="player-flow/platform-adaptations.html"><strong aria-hidden="true">18.16.</strong> Platform Adaptations</a></span></li></ol></li></ol>';
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

