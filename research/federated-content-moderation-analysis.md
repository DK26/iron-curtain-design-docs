# Federated & P2P Content Moderation — Platform Analysis

> **Research objective:** Analyze how existing platforms handle content moderation — specifically malicious content (malware, data theft, exploits) — across centralized, federated, and P2P distribution models. Extract practical mechanisms applicable to Iron Curtain's federated Workshop system (D030/D049/D050).
>
> **Context:** IC's Workshop is a federated mod/map/asset distribution system where multiple independent community servers host and distribute content via BitTorrent P2P. This creates moderation challenges that no single existing platform has fully solved. This analysis examines seven platform categories and distills lessons.
>
> **Companion documents:**
> - `workshop-registry-vulnerability-analysis.md` — vulnerability classes and mitigations (typosquatting, dependency confusion, etc.)
> - `p2p-federated-registry-analysis.md` — platform architecture and market analysis
>
> **Date:** February 2026

---

## 1. Steam Workshop

### Moderation Mechanisms

**Automated scanning:** Steam scans uploaded Workshop files, but the system is widely regarded as unreliable. Community reports indicate it produces false positives on legitimate mods while missing actual malware. There is no public documentation on what scanning engine Valve uses. The system is a black box.

**Manual review:** Some games (notably CS:GO/CS2) require Workshop content to pass an approval process before appearing publicly. However, this is game-specific — most games allow immediate publication with no human review. The approval process, where it exists, is primarily for quality/copyright rather than security.

**Reporting:** Users can report Workshop items. Reports feed into Valve's general content moderation queue. Response times are inconsistent, ranging from hours to weeks depending on severity and visibility.

**Auto-updates as attack vector:** Steam Workshop has no option to disable auto-updates for subscribed mods. Once a user subscribes, any update pushed by the mod author (or an attacker who compromises their account) is automatically downloaded and applied. This is the single largest architectural vulnerability — it turns every account compromise into an instant supply chain attack.

### Real-World Failures

| Incident | Year | What Happened |
|---|---|---|
| **Cities: Skylines mods** | 2022 | Several mods found containing keyloggers and bitcoin mining software. Removed after community reports. |
| **Slay the Spire "Downfall" mod** | 2023 | Attacker compromised the mod author's Steam account on Christmas Day. Pushed a malicious update that stole browser passwords. Auto-update delivered it to all subscribers within ~1 hour before recovery. |
| **People Playground "FPS++"** | 2026 | Worm malware uploaded as a mod. It scanned the subscriber's published Workshop items, silently edited and reuploaded them, created new public items, upvoted items, and deleted local saves/configs/maps. Reached the top-rated section, spreading rapidly. Developer had to disable Workshop entirely for 5 days. |

### What Worked

- Valve added SMS-based 2FA for developers pushing builds (post-Downfall incident), reducing account takeover risk.
- Per-game Workshop configuration lets developers choose whether content requires approval.

### What Failed

- No meaningful automated malware detection.
- Auto-updates with no user control create instant propagation of compromised content.
- No sandboxing of Workshop content — mods run with full game process privileges.
- No content signing by mod authors — Valve is the sole trust anchor, so account compromise = total compromise.
- Reactive-only moderation: malware is caught by community reports after damage is done.

### Lessons for IC Workshop

1. **Never auto-update without user consent or at minimum a review window.** A quarantine period for updates (even 1 hour) would have prevented the Downfall incident.
2. **Mod author signing is essential.** If mods are signed by their author's key (not just the platform's), account compromise on the platform alone is insufficient — the attacker also needs the author's signing key.
3. **Per-game approval workflows** are a good idea when game developers want them, but cannot be the only defense.
4. **Workshop content sandboxing** is a fundamental requirement, not an optional feature.

---

## 2. Nexus Mods

### Moderation Mechanisms

**VirusTotal integration:** All uploaded files are sent to VirusTotal, which scans them with 50+ antivirus engines. Files are not downloadable until the scan completes clean. If more than 4 engines flag a file, it is quarantined and requires manual moderator review before release.

**Quarantine system:** Files that fail security checks or violate policies are hidden from public view while remaining on the platform. Moderators can investigate quarantined files and either approve or reject them.

**Reporting system:** Users can report content with categorized reasons and attach up to 5 images/text files as evidence. Moderators can view the full history of reports against a user or their content, enabling pattern detection across multiple reports.

**Moderator tooling:** Community Managers can block users from earning Donation Points (financial penalty for ToS violations). Moderators have access to cross-user/cross-content report histories.

**No automated behavioral analysis:** Nexus Mods does not perform static analysis, sandboxed execution, or behavioral monitoring of mod files. The scanning is purely signature-based via VirusTotal.

### What Worked

- VirusTotal integration is a practical, low-cost way to catch known malware. It blocks a baseline of threats with minimal engineering investment.
- The quarantine-before-release model means no file reaches users without at least passing automated scanning.
- Report evidence attachments give moderators actionable context.

### What Failed

- Signature-based scanning misses novel/bespoke malware entirely. The fractureiser malware (see Section 3) would not have been caught by VirusTotal at the time of initial upload.
- No sandboxing or behavioral analysis means a carefully crafted malicious mod can pass all checks.
- False positives from VirusTotal are common (mods using code injection for legitimate hooking get flagged), creating moderator fatigue.

### Lessons for IC Workshop

1. **VirusTotal (or multi-engine scanning) as a baseline** — cheap, catches commodity malware, worth doing. But never sufficient alone.
2. **Quarantine-before-release** is a strong pattern: content is not available for download until it passes automated checks.
3. **Cross-report history** per publisher is valuable for detecting serial bad actors across multiple uploads.
4. **Financial disincentives** (blocking reputation/donation points) are an effective soft tool for borderline violations.

---

## 3. CurseForge / Modrinth (Minecraft) — The Fractureiser Incident

### The Incident (June 2023)

The fractureiser malware was a multi-stage, multi-platform (Windows + Linux) infostealer that spread through compromised CurseForge and Bukkit accounts. It was the most significant malware incident in game modding history.

**Attack chain:**
1. **Stage 0:** Attacker compromised several CurseForge author accounts. Injected a malicious function at the end of the main class in existing popular mods and uploaded new malicious mods.
2. **Stage 1:** The injected code downloaded a second-stage payload from attacker-controlled infrastructure.
3. **Stage 2:** Established persistence, stole browser credentials, Discord tokens, Microsoft/Minecraft session tokens.
4. **Stage 3:** Self-replicated by using stolen CurseForge credentials to infect other mods, creating a worm-like spread.

The malware spread through popular modpacks including "Better Minecraft," reaching potentially tens of thousands of users before detection.

### Platform Responses

**CurseForge:**
- Banned compromised accounts.
- Developed open-source stage0/stage2/stage3 detection tools.
- Retroactively scanned all uploaded mods for stage0 infections.
- Deleted all known infected files.
- Temporarily suspended new file approvals.
- Added additional scanning protocols to the moderation pipeline.

**Modrinth:**
- Scanned 10 months of uploads retroactively — found no infected mods (the attack targeted CurseForge specifically).
- Implemented in-house malware scanning tools.
- Added automated code pattern analysis for suspicious behavior.
- New projects are reviewed by content moderators within 24-48 hours (72-96 for modpacks).
- When the automated scanner flags something, it goes to a technical moderator for manual code review (extending review time significantly).

**Community response:**
- The fractureiser investigation team (community-organized) published detailed technical analysis, detection tools, and user remediation guides on GitHub.
- A cross-platform meeting was held between Modrinth, CurseForge, Fabric, Forge, and FTB representatives to establish shared security protocols.

### Fundamental Problem: Java Mod Scanning Is Hard

Both platforms acknowledged that automated virus scanning for Java mods is inherently difficult. Traditional antivirus signatures target known malware; bespoke Java code that downloads a payload is trivially easy to write in novel ways that evade signature detection. The fractureiser code was custom-written and would not have been caught by VirusTotal at the time of upload.

### What Changed Permanently

1. Both platforms now scan uploads (CurseForge with their custom tools, Modrinth with in-house scanner).
2. Human review of new projects became standard on Modrinth (was not before the incident).
3. The community developed and maintains detection tools independently of the platforms.
4. Cross-platform coordination on security incidents became an established practice.

### What Did NOT Change

1. No code signing by mod authors was mandated on either platform.
2. No sandboxing of Java mods was implemented (Java mods still run with full JVM privileges).
3. No reproducible builds requirement (which would prove the published binary matches the source).
4. The fundamental model of "trust the platform, trust the account" remains.

### Lessons for IC Workshop

1. **Account compromise is the primary attack vector**, not uploading new malicious content from scratch. 2FA and signing keys tied to publisher identity (not just platform accounts) are the strongest defenses.
2. **Retroactive scanning capability is essential.** When a new threat is identified, the platform must be able to scan all historical content quickly.
3. **Community-driven security investigation** was faster and more effective than either platform's internal response. Design for this: provide APIs, file hashes, and metadata access that enable community researchers.
4. **Cross-server coordination protocols** should be designed into the federation model from day one, not bolted on after an incident.
5. **Sandboxing is the only reliable defense against novel malware.** Scanning will always be a cat-and-mouse game. IC's tiered modding (YAML/Lua/WASM) with WASM sandboxing is architecturally superior to CurseForge/Modrinth's "run arbitrary Java" model.

---

## 4. F-Droid

### Moderation Mechanisms

**Source-only builds:** F-Droid's main repository builds all apps from source code, not from developer-provided binaries. This means the build process is auditable and malicious code injected only into binaries (not source) would be caught.

**Reproducible builds:** F-Droid aims for reproducible builds where anyone can rebuild an APK from the same source and get an identical binary (bit-for-bit). When achieved, this enables Diverse Double-Compiling: two entirely independent build infrastructures produce the same output, making build-system compromise detectable. F-Droid now ships some APKs signed by upstream developers through reproducible builds, proving both the developer and F-Droid agree on the binary content.

**Repository signing:** Each F-Droid repository has a unique signing key. The signed metadata (index) includes a list of official mirrors. The client verifies signatures before installing anything. Third-party repositories are clearly marked as untrusted by default.

**Anti-feature flagging:** Apps with undesirable properties (ads, tracking, non-free dependencies) are flagged with machine-readable "anti-feature" tags rather than removed. Users can filter on these tags. This is a transparency mechanism rather than a removal mechanism.

**Human review:** All apps in the main repository undergo human review before inclusion. The review checks source code, build scripts, and metadata for policy compliance.

### Federation Model

F-Droid supports third-party repositories that anyone can create and host. Users manually add repositories by URL. The client treats them as separate trust domains — each repository has its own signing key, and the F-Droid project explicitly disclaims responsibility for third-party repos. If the same app exists in multiple repositories, the user sees all sources and can choose which to install, with priority ordering.

**fdroidserver validation:** For repos that host developer-provided APKs (rather than building from source), fdroidserver validates that APKs are signed with the declared developer key. APKs that don't match the expected signature are rejected from the index.

### Known Weaknesses

- F-Droid signs most apps with its own keys (one per app), not the upstream developer's key. Users must trust F-Droid's build infrastructure, which is a single point of compromise.
- Build infrastructure has had issues: from June to November 2022, the build VM ran end-of-life Debian.
- Reproducible builds are aspirational — only a minority of apps achieve bit-for-bit reproducibility in practice.
- The client has had security issues when connected to a malicious third-party repository.
- Update delays mean security patches reach users slower than through Google Play.
- In 2022, F-Droid discovered 20+ distributed apps contained known vulnerabilities.

### Lessons for IC Workshop

1. **Reproducible builds are the gold standard** for content integrity in a federated system. If IC Workshop mods can be built from source with deterministic output, any community server can verify that the distributed binary matches the claimed source. This is particularly viable for YAML data mods and Lua scripts (which are distributed as source anyway).
2. **Repository-level signing with per-repo keys** creates clear trust boundaries. Each IC community server should have its own signing key, and the client should track which server vouches for which content.
3. **Anti-feature tagging over removal** is a useful transparency mechanism for borderline content. A mod that is legitimate but contains aggressive monetization or analytics could be tagged rather than delisted.
4. **Federated repos need explicit trust UI.** F-Droid's approach of letting users manually add repos with clear warnings is better than silently trusting all federated sources.
5. **Build-from-source where possible.** For YAML and Lua mods, the Workshop could distribute source and build/validate locally. WASM mods are the harder case — binary distribution requires stronger signing.

---

## 5. Mastodon / Fediverse

### Moderation Mechanisms

**Instance-level moderation:** Each Mastodon server is independently administered. The server admin has full control over content moderation policy for their instance. There is no central authority.

**Defederation (server blocking):** Admins can sever all connections to another server. This is a two-way block: users on neither server can see or interact with the other. It is the primary tool for handling servers that fail to moderate harmful content.

**Silence/Limit:** A softer option than full defederation. Silenced servers' content doesn't appear in federated timelines but is still accessible if users explicitly follow accounts from that server.

**User-level moderation:** Individual users can block, mute, or report accounts. Reports can be forwarded to the remote server's admin for action.

**The #FediBlock hashtag:** Since there are no shared federation-wide moderation tools, admins share information about problematic servers via the #FediBlock hashtag. This is a social protocol, not a technical one — admins post descriptions of harmful servers, and other admins decide whether to act.

### Shared Blocklist Ecosystem

**Import/export (Mastodon 4.1+):** Admins can import and export blocklists as CSV files from the admin interface (Moderation > Federation). This enables blocklist sharing.

**Curated blocklists:** Several community-maintained blocklists exist:
- **Garden Fence:** Conservative list. A domain must be blocked by the maintainer's server AND a minimum of 6 out of 7 reference servers. Only full suspensions count (silence/limit is ignored). This consensus-based approach reduces false positives.
- **Oliphant.Social blocklist:** Aggregates multiple admin blocklists with configurable thresholds.
- **fediblockhole (CLI tool):** Imports blocklists from multiple sources (remote servers, URLs, local files) and applies them. Enables automated blocklist synchronization.

**Reference server model:** Blocklist curators select "reference servers" — instances with compatible values, independent operation, and active moderation. Consensus is measured across these references. This is functionally a **trust anchor set** — a small group of independently-operated servers whose collective judgment is treated as authoritative.

### What Worked

- **Defederation is simple, effective, and fast.** One admin action instantly protects all users on that instance.
- **Layered options** (full block vs. silence) let admins calibrate their response.
- **The blocklist ecosystem emerged organically.** No central coordination was needed — admins self-organized around shared lists.
- **Consensus-based blocklists** (Garden Fence model) balance thoroughness with false positive reduction.
- **Import/export standardization** (CSV format in Mastodon 4.1) enabled tooling.

### What Failed

- **No federation-wide moderation tooling.** Everything is per-instance, meaning small instances with solo admins struggle to keep up.
- **Blocklist politics.** Disagreements about what should be blocked create community splits. Some admins view shared blocklists as outsourcing their judgment.
- **#FediBlock is noisy and subjective.** It relies on social trust rather than verifiable evidence.
- **New instance onboarding is hard.** A brand-new instance starts with no blocks and must discover problematic servers through experience or by importing blocklists.
- **No automated detection.** There are no protocol-level spam/malware detection mechanisms. All moderation is human-driven.

### Lessons for IC Workshop

1. **The defederation model maps directly to Workshop federation.** A community server admin should be able to block content from specific other servers — either fully (hide all content) or partially (hide from browse/search but allow direct access).
2. **Shared blocklists with consensus thresholds** are the most practical cross-server trust mechanism. IC should design a blocklist interchange format from day one. A package hash or publisher ID blocklist that multiple server admins can contribute to and subscribe to.
3. **Reference server trust anchors** work well. IC's official server could serve as one reference, but should not be the only one. A set of 5-7 independently-operated community servers whose collective blocks carry weight.
4. **Provide tooling for small server admins.** Most IC community servers will be run by one person. Automated blocklist sync (like fediblockhole) should be built-in, not a third-party add-on.
5. **Layered trust, not binary trust.** Content from unknown servers can be available but flagged, rather than completely blocked or completely trusted.

---

## 6. Package Registries (npm, crates.io, PyPI)

### Moderation Mechanisms

#### Automated Scanning

**npm:** Third-party security vendors (Socket, Aikido, Snyk) continuously scan the npm registry for malicious packages. GitHub/npm itself runs automated analysis. In practice, most malicious packages are caught by these external scanners within 1-7 days of publication.

**PyPI:** PyPI removed over 12,000 malicious projects in 2022 alone. Automated detection uses rule-based systems and AI to identify suspicious patterns (obfuscated code, install-time network calls, credential access patterns). The PyPI team has limited staff, so automated detection is essential.

**crates.io:** Malicious crates are detected through community reports and (increasingly) automated scanning. Recent incidents include cryptocurrency key stealers impersonating legitimate crates. Response involves immediate crate deletion and account disabling.

**Scale of the problem:** In Q2 2025, security scanners found malicious packages across 1.4 million npm and 400,000 PyPI packages. The attack volume is enormous and growing — automated defenses are the only viable approach at scale.

#### Provenance & Supply Chain Security

**Sigstore and SLSA provenance (npm):** npm introduced provenance attestations (GA October 2023) using Sigstore. When a package is published from a CI system with provenance support, it is signed by Sigstore public good servers and logged in a public transparency ledger. The attestation cryptographically binds the published package to a specific Git commit, repository, and build workflow. Users can verify that a package was built from the claimed source.

**Trusted Publishing (npm, crates.io, PyPI):** All three major registries have implemented or are implementing OIDC-based trusted publishing:
- **npm:** Trusted publishing via GitHub Actions OIDC.
- **crates.io:** Trusted publishing via GitHub Actions (July 2025) and GitLab CI (early 2026). Short-lived tokens (15 minutes) replace long-lived API tokens.
- **PyPI:** PEP 740 digital attestations (late 2024) using Sigstore, automatically included in packages published via the PyPI publish GitHub Action.

**Key insight:** Trusted publishing does not prevent malicious code — it prevents unauthorized publishing. If a maintainer's source repository is compromised, trusted publishing will happily sign and publish the malicious code. It solves the "stolen API token" problem, not the "compromised maintainer" problem.

**Transparency log monitoring:** OpenSSF-funded Sigstore rekor-monitor enables maintainers to watch the transparency log for unexpected publications of their packages. This is a detection mechanism, not a prevention mechanism.

#### The 7-Day Quarantine Insight

Security researchers have observed that waiting 7-14 days after a package release before accepting it as a dependency prevents the majority of supply chain attacks. Most malicious packages are detected and removed within this window by automated scanners. This suggests a practical defense: **delay trust, don't grant it immediately.**

### The Shai-Hulud 2.0 Attack (2025)

The most significant npm supply chain attack to date. Attackers modified hundreds of public packages to harvest credentials from developer environments, CI/CD pipelines, and cloud workloads. Malicious code executed during the `preinstall` phase — before any tests or security checks could run. The attack was more automated and faster-propagating than previous incidents, demonstrating that the cat-and-mouse game between attackers and defenders is accelerating.

### What Worked

- **Provenance attestations** give users a way to verify the supply chain (when they check — most don't yet).
- **Trusted publishing** eliminated a major class of credential theft attacks.
- **Third-party security scanning ecosystem** catches most malware within days.
- **Transparency logs** enable after-the-fact forensics.
- **Community reporting** remains the first detection mechanism for many incidents.

### What Failed

- **Automated client-side verification is still incomplete.** pip and uv don't verify attestations automatically. npm's verification is optional.
- **Install-time code execution** (npm preinstall scripts, Python setup.py) is the primary attack surface, and none of the registries have eliminated it.
- **Volume overwhelms manual review.** PyPI removes thousands of malicious packages per year, but new ones appear faster than humans can review.
- **Provenance doesn't prove intent.** A legitimately-built package from a compromised repository is still malicious.

### Lessons for IC Workshop

1. **Trusted publishing for community servers.** If a community server publishes content to the federation, its publications should be signed with OIDC-derived short-lived tokens tied to its build/publish infrastructure, not long-lived API keys.
2. **The 7-day quarantine window is directly applicable.** New mods or major updates from unverified publishers could have a "cooling off" period where they are available but flagged as "new/unverified." Community servers could choose their own quarantine thresholds.
3. **Transparency logs for the Workshop index.** Every publication event (new mod, update, deletion) should be logged in an append-only, publicly auditable log. This enables detection of unauthorized modifications after the fact.
4. **No install-time code execution.** IC's YAML/Lua/WASM tier model already prevents this by design — YAML is data, Lua is sandboxed, WASM is sandboxed. This is a massive architectural advantage over npm/PyPI/Java mods.
5. **Build third-party scanning integration points.** Even if IC doesn't build its own malware scanner, provide APIs and file access that enable community security researchers to scan and report.

---

## 7. BitTorrent / WebTorrent

### Content Filtering at the Protocol Level

**The protocol has no content filtering.** BitTorrent and WebTorrent are content-agnostic transport protocols. They distribute bytes identified by info hashes. There is no mechanism in the protocol to inspect, filter, or block content based on what it contains.

### Where Filtering Can Occur

**Tracker level:** BitTorrent trackers can implement filter functions for blacklisting/whitelisting torrents based on info hash. A tracker can refuse to serve peers for specific info hashes. This is the simplest filtering point — the tracker is a centralized component that can enforce policy.

**Client level:** WebTorrent supports a blocklist parameter for blocking specific IP addresses. Some BitTorrent clients support IP blocklists (e.g., PeerGuardian-style lists). This blocks specific peers, not specific content.

**DHT level:** The distributed hash table has no filtering mechanism. Content announced to the DHT is globally discoverable. There is no way to remove content from the DHT — you can only stop seeding it.

**ISP/network level:** ISPs and enterprise networks use deep packet inspection (DPI) to identify and throttle/block BitTorrent traffic. BitTorrent clients counter with protocol obfuscation (lazy bitfield, encryption). This is an arms race unrelated to content moderation.

### Implications

BitTorrent provides transport, not trust. All content moderation must happen above the transport layer:
- **At the index/registry layer:** Decide which torrents to list and serve metadata for.
- **At the client layer:** Decide which torrents to download and what to do with the content after download.
- **At the tracker layer:** Decide which info hashes to serve peers for.

### Lessons for IC Workshop

1. **All moderation happens at the metadata layer, not the transport layer.** IC's Workshop index (the git-hosted package registry) is where trust decisions are made. BitTorrent just moves bytes.
2. **Tracker control is the primary P2P moderation lever.** IC community servers that run trackers can refuse to seed blocked content. If no tracker serves an info hash, P2P distribution effectively stops (unless peers have the info hash from another source).
3. **DHT provides censorship resistance but also moderation resistance.** If IC uses DHT for peer discovery, blocked content can still be distributed peer-to-peer as long as any seed exists. This is a design tradeoff: DHT makes the system resilient but harder to moderate.
4. **Info hash is the content identifier for moderation.** Blocklists should operate on info hashes (content-addressed), not file names or metadata (which can be changed).

---

## Cross-Cutting Synthesis: Lessons for IC Workshop

### The Three Layers of Defense

Every platform studied uses some combination of three layers. No platform that relies on only one layer has adequate moderation.

| Layer | Mechanism | Examples | IC Equivalent |
|---|---|---|---|
| **Prevention** | Stop malicious content from being published | Code signing, trusted publishing, human review, automated scanning | Publisher signing keys, WASM sandboxing, quarantine-before-release |
| **Detection** | Find malicious content after publication | VirusTotal, community reports, retroactive scanning, transparency logs | Multi-engine scanning, community reporting API, append-only publication log |
| **Containment** | Limit damage when malicious content is found | Defederation, blocklists, update controls, sandboxing | Server-level blocklists, update quarantine periods, YAML/Lua/WASM sandboxing |

### Ranked Mechanisms by Effectiveness

Based on real-world outcomes across all seven platforms:

1. **Sandboxing (highest impact).** The single most effective defense. IC's WASM sandbox for power-user mods and Lua sandbox for scripts are architecturally superior to every modding platform studied. CurseForge, Steam Workshop, and Nexus Mods all run mod code with full process privileges — which is why every malware incident caused full system compromise.

2. **Content signing by authors (not just platforms).** Every major account-compromise incident (Downfall, fractureiser, People Playground) succeeded because the platform's trust model is "trust the account." If mod authors sign content with their own keys, an attacker must compromise both the account AND the signing key. F-Droid's reproducible builds approach is the gold standard but hard to achieve; author signing is the pragmatic middle ground.

3. **Quarantine/cooling-off periods.** The npm 7-day observation, Nexus Mods' quarantine-before-release, and Modrinth's 24-48 hour review period all demonstrate that delaying availability catches most threats. For a game mod Workshop, a configurable quarantine period (server admins choose their risk tolerance) is practical and effective.

4. **Federated blocklists with consensus thresholds.** The Mastodon/Fediverse model of shared blocklists with reference server consensus is directly applicable to IC. A content hash or publisher blocklist that multiple community server admins can contribute to and subscribe to, with configurable trust thresholds.

5. **Automated scanning (baseline, not sufficient).** VirusTotal-style multi-engine scanning catches commodity malware cheaply. It should be a baseline check but never the only defense — it missed fractureiser, would miss any bespoke attack, and produces false positives that cause moderator fatigue.

6. **Transparency/audit logs.** Sigstore-style append-only logs enable forensics and detection of unauthorized publications. Low cost to implement, high value when incidents occur. Every Workshop publication event should be logged immutably.

7. **Community-driven investigation.** The fractureiser response demonstrated that community researchers are faster and more thorough than platform security teams. IC should design for community security research: provide APIs, hashes, metadata access, and reporting tools.

### What Consistently Fails

1. **Relying solely on automated scanning.** Every platform that depends on signature-based scanning has been bypassed by novel malware.
2. **Reactive-only moderation.** Steam Workshop's "wait for reports" model means damage is done before detection. Prevention and containment must complement detection.
3. **Platform-only trust (no author signing).** Every major incident exploited the fact that compromising a platform account is sufficient to publish malicious content.
4. **Treating federation as "no moderation needed."** F-Droid's third-party repos and Mastodon's open federation both demonstrate that federated systems need MORE moderation tooling, not less, because there is no central authority to fall back on.
5. **No update controls.** Steam Workshop's mandatory auto-updates amplify every compromise into instant mass propagation.

### IC Workshop-Specific Recommendations

Based on this analysis, ranked by implementation priority:

1. **Maintain the YAML/Lua/WASM sandbox architecture as non-negotiable.** This is IC's single biggest advantage over every platform studied. Do not allow mods to escape the sandbox for convenience. Every escape hatch becomes the attack surface.

2. **Implement publisher signing keys separate from platform accounts.** A mod is signed by the author's key AND vouched for by the community server that hosts it. Both must be valid. Key rotation, revocation, and the ability for servers to ban specific publisher keys.

3. **Design the federated blocklist protocol early.** Define the interchange format for blocklists (content hashes, publisher IDs, server IDs). Support import/export, automated sync, and configurable consensus thresholds (e.g., "block if 3+ of my trusted servers agree").

4. **Build quarantine-before-release into the default workflow.** New uploads and updates are scanned and held for a configurable period before becoming available. Server admins choose their quarantine duration. First-time publishers get longer quarantine than established ones.

5. **Append-only publication log.** Every Workshop publication event (publish, update, yank, transfer) is logged in an auditable, append-only log. This enables retroactive scanning when new threats are identified and provides forensic evidence for incident response.

6. **No silent auto-updates.** Users should control when mod updates are applied. Options: manual approval, auto-update with rollback capability, or auto-update with quarantine window. Never push updates that execute immediately with no user awareness.

7. **Community security research APIs.** Provide endpoints for querying file hashes, publication metadata, and publisher history. Enable community members to build scanning tools, blocklists, and monitoring systems without needing platform access.

8. **Tracker-level content blocking.** Community server trackers should refuse to seed content that is on the server's blocklist. This is the BitTorrent-layer equivalent of defederation — it doesn't prevent all distribution (DHT still works) but removes the server's infrastructure support.

---

## Platform Comparison Matrix

| Feature | Steam Workshop | Nexus Mods | CurseForge | Modrinth | F-Droid | Mastodon | npm/PyPI/crates.io |
|---|---|---|---|---|---|---|---|
| **Automated malware scan** | Minimal | VirusTotal | Post-fractureiser | In-house | N/A (builds from source) | None | Third-party ecosystem |
| **Human review** | Per-game optional | Quarantine review | Post-incident | 24-48h for new projects | All apps | Per-instance admin | Minimal |
| **Content signing by author** | No | No | No | No | Partial (reproducible builds) | N/A | Sigstore provenance |
| **Sandboxing** | No | No | No | No | Android sandbox | N/A | No (install scripts) |
| **Update controls** | None (forced auto-update) | Manual download | Launcher-controlled | Launcher-controlled | User-controlled | N/A | Lockfiles |
| **Federated blocklists** | N/A (centralized) | N/A | N/A | N/A | Per-repo trust | Yes (CSV + tools) | N/A (centralized) |
| **Transparency/audit log** | No | No | No | No | Git-based metadata | ActivityPub trail | Sigstore Rekor |
| **Cross-platform incident response** | No | No | Post-fractureiser | Post-fractureiser | No | #FediBlock hashtag | CVE + advisory ecosystem |
| **Quarantine period** | No | Scan-time only | No | Review-time | No | N/A | 7-day observation (informal) |

---

## Sources

### Steam Workshop
- [Stage Four Security: Mods and User-Generated Content](https://stagefoursecurity.com/blog/2025/05/13/mods-and-user-generated-content/)
- [Steam Workshop Content Must Now Go Through An Approval Process (Kotaku)](https://kotaku.com/steam-workshop-content-must-now-go-through-an-approval-1837149464)
- [People Playground hit by malware via Steam Workshop (GamingOnLinux)](https://www.gamingonlinux.com/2026/02/steam-game-people-playground-hit-by-malware-via-the-steam-workshop/)
- [Hackers uploaded malware through a popular game mod on Steam (gHacks)](https://www.ghacks.net/2023/12/28/hackers-uploaded-malware-through-a-popular-game-mod-on-steam/)
- [Steam game mod breached to push password-stealing malware (BleepingComputer)](https://www.bleepingcomputer.com/news/security/steam-game-mod-breached-to-push-password-stealing-malware/)

### Nexus Mods
- [Nexus Mods Moderation Policy](https://help.nexusmods.com/article/27-moderation-policy)
- [Virus Scanning at Nexus Mods](https://help.nexusmods.com/article/128-anti-virus-false-positives)
- [Virus scan reports now visible on file pages (Nexus Mods News)](https://www.nexusmods.com/news/12378)
- [Why has my mod been quarantined? (Nexus Mods Help)](https://help.nexusmods.com/article/117-why-has-my-mod-been-quarantined)

### CurseForge / Modrinth / Fractureiser
- [fractureiser investigation (GitHub)](https://github.com/trigram-mrp/fractureiser)
- [Prism Launcher: MALWARE WARNING - fractureiser](https://prismlauncher.org/news/cf-compromised-alert/)
- [fractureiser malware analysis (Bitdefender)](https://www.bitdefender.com/en-us/blog/labs/infected-minecraft-mods-lead-to-multi-stage-multi-platform-infostealer-malware)
- [New Fractureiser malware used CurseForge mods (BleepingComputer)](https://www.bleepingcomputer.com/news/security/new-fractureiser-malware-used-curseforge-minecraft-mods-to-infect-windows-linux/)
- [Modrinth: Windows Borderless Malware Disclosure](https://blog.modrinth.com/p/windows-borderless-malware-disclosure)
- [Modrinth project review times](https://support.modrinth.com/en/articles/8793355-modrinth-project-review-times)

### F-Droid
- [F-Droid Security Model](https://f-droid.org/en/docs/Security_Model/)
- [F-Droid Reproducible Builds](https://f-droid.org/en/docs/Reproducible_Builds/)
- [Reproducible builds, signing keys, and binary repos (F-Droid blog)](https://f-droid.org/2023/09/03/reproducible-builds-signing-keys-and-binary-repos.html)
- [F-Droid Security Issues (PrivSec)](https://privsec.dev/posts/android/f-droid-security-issues/)
- [Repository Overhaul in Client 1.20 (F-Droid)](https://f-droid.org/2024/05/16/repository-overhaul-in-client-1-20.html)

### Mastodon / Fediverse
- [Mastodon Moderation Documentation](https://docs.joinmastodon.org/admin/moderation/)
- [FediBlock (Join the Fediverse Wiki)](https://joinfediverse.wiki/FediBlock)
- [Garden Fence Blocklist (GitHub)](https://github.com/gardenfence/blocklist)
- [fediblockhole (blocklist sync tool)](https://github.com/Anthchirp/mastodon-defederate)
- [Navigating Defederation on Decentralized Social Media (Carnegie Endowment)](https://carnegieendowment.org/research/2025/03/fediverse-social-media-internet-defederation)
- [Fediverse Blocklists: Moderation in Noncapitalist Social Networks (triple-c)](https://www.triple-c.at/index.php/tripleC/article/view/1556/1670)

### Package Registries (npm, crates.io, PyPI)
- [npm Security 2025: Provenance and Sigstore (DEV Community)](https://dev.to/dataformathub/npm-security-2025-why-provenance-and-sigstore-change-everything-2m7j)
- [crates.io development update (Rust Blog)](https://blog.rust-lang.org/2026/01/21/crates-io-development-update/)
- [crates.io malicious crate notification policy update (Rust Blog)](https://blog.rust-lang.org/2026/02/13/crates.io-malicious-crate-update/)
- [crates.io Trusted Publishing (RFC 3691)](https://rust-lang.github.io/rfcs/3691-trusted-publishing-cratesio.html)
- [Catching Malicious Packages with Rekor Transparency Log (OpenSSF)](https://openssf.org/blog/2025/12/19/catching-malicious-package-releases-using-a-transparency-log/)
- [Shai-Hulud 2.0 Supply Chain Attack (Palo Alto Unit42)](https://unit42.paloaltonetworks.com/npm-supply-chain-attack/)
- [Malicious Packages Across Open-Source Registries Q2 2025 (FortiGuard)](https://www.fortinet.com/blog/threat-research/malicious-packages-across-open-source-registries)
- [Amazon Inspector detects 150K+ malicious packages (AWS)](https://aws.amazon.com/blogs/security/amazon-inspector-detects-over-150000-malicious-packages-linked-to-token-farming-campaign/)

### BitTorrent / WebTorrent
- [BitTorrent Specification (TheoryOrg)](https://wiki.theory.org/BitTorrentSpecification)
- [WebTorrent API Documentation](https://webtorrent.io/docs)
- [bittorrent-tracker (GitHub)](https://github.com/webtorrent/bittorrent-tracker)
