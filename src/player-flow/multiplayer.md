## Multiplayer

### Multiplayer Hub

```
Main Menu → Multiplayer
```

```
┌──────────────────────────────────────────────────────────┐
│  MULTIPLAYER                                 [← Back]    │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  ► Find Match          Ranked 1v1 / Team queue   │   │
│  │  ► Game Browser        Browse open games          │   │
│  │  ► Join Code           Enter IRON-XXXX code       │   │
│  │  ► Create Game         Host a lobby               │   │
│  │  ► Direct Connect      IP address (LAN/advanced)  │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  QUICK INFO                                       │   │
│  │  Players online: 847                              │   │
│  │  Games in progress: 132                           │   │
│  │  Your rank: Captain II (1623)                     │   │
│  │  Season 3: 42 days remaining                      │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  Recent matches: [view all →]                            │
│  ┌────────────────────────────────────────────┐         │
│  │ vs. PlayerX (Win +24)  5 min ago  [Replay] │         │
│  │ vs. PlayerY (Loss -18) 1 hr ago   [Replay] │         │
│  └────────────────────────────────────────────┘         │
└──────────────────────────────────────────────────────────┘
```

### Five Ways to Connect

| Method             | Flow                                                     | Best For                       |
| ------------------ | -------------------------------------------------------- | ------------------------------ |
| **Find Match**     | Queue → Ready Check → Map Veto (ranked) → Loading → Game | Competitive/ranked play        |
| **Game Browser**   | Browse list → Click game → Join Lobby → Loading → Game   | Finding community games        |
| **Join Code**      | Enter `IRON-XXXX` → Join Lobby → Loading → Game          | Friends, Among Us-style casual |
| **Create Game**    | Configure Lobby → Share code/wait for joins → Start      | Hosting custom games           |
| **Direct Connect** | Enter IP:port → Join Lobby → Loading → Game              | LAN parties, power users       |

Additionally: **QR Code** scanning (mobile/tablet) and **Deep Links** (Discord/Steam invites) resolve to the Join Code path.

### Network Experience Help

For a player-focused explanation of relay/sub-tick timing and practical optimization tips, see [network-experience.md](network-experience.md).

### Game Browser

```
Multiplayer Hub → Game Browser
```

```
┌──────────────────────────────────────────────────────────────┐
│  GAME BROWSER                                    [← Back]    │
│                                                              │
│  🔎 Search...   Filters: [Map ▾] [Mod ▾] [Status ▾] [▾]    │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ ▸ Coastal Fortress 2v2        2/4 players   Waiting   │ │
│  │   Host: CommanderX ★★★        Vanilla RA    ping: 45  │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │ ▸ Desert Arena FFA            3/6 players   Waiting   │ │
│  │   Host: TankRush99            IC Default    ping: 78  │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │ ▸ Combined Arms 3v3           5/6 players   Waiting   │ │
│  │   Host: ModMaster ✓           CA v2.1       ping: 112 │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │   (greyed) Tournament Match   2/2 players   Playing   │ │
│  │   Host: ProPlayer             IC Default    [Spec →]  │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  Sources: ✓ Official  ✓ CnCNet  ✓ Community  [Manage →]     │
│                                                              │
│  Showing 47 games from 3 tracking servers                    │
└──────────────────────────────────────────────────────────────┘
```

- Click a game → Join Lobby (mod auto-download if needed, D030)
- In-progress games show [Spectate →] if spectating is enabled
- Trust indicators: ✓ Verified (bundled sources) vs. "Community" (user-added tracking servers)
- Sources configurable in Settings — merge view across official + community + OpenRA + CnCNet tracking servers

**Server/room listing metadata** — each listing in the game browser will expose the following fields. Not all fields are shown as columns in the default table view — some are visible on hover, in an expanded detail panel, or as filter/sort criteria.

| Category | Field | Notes |
|----------|-------|-------|
| **Identity** | Server/Room Name | User-chosen name |
| | Host Player Name | With verified badge if cryptographically verified (D052) |
| | Dedicated / Listen Server | Dedicated = standalone server; Listen = hosted by a player's client |
| | Description (free-text) | Optional short description set by host (max ~200 chars) |
| | MOTD (Message of the Day) | Optional longer message shown on join or in detail panel |
| | Server URL / Rules Page | Link to community rules, Discord, website |
| | Tags / Keywords | Free-form tags for flexible filtering (inspired by Valve A2S); e.g., `newbies`, `no-rush-20`, `tournament`, `clan-war` |
| **Game state** | Status | `Waiting` / `In-Game` / `Post-Game` |
| | Lobby Phase (detail) | More granular: `open` / `filling` / `ready` / `countdown` / `in-game` / `post-game` |
| | Playtime / Duration | How long the current game has been running (for in-progress games) |
| | Rejoinable | Whether a disconnected player can rejoin (important for lockstep) |
| | Replay Recording | Whether the match is being recorded as a `.icrep` |
| **Players** | Current Players / Max Players | e.g., "3/6" |
| | Team Format | Compact format: `1v1`, `2v2`, `3v3`, `FFA`, `2v2v2`, `Co-op` |
| | AI Count + Difficulty | e.g., "2 AI (Hard)" — not just count |
| | Spectator Count / Spectator Slots | Whether spectators are allowed and current count |
| | Open Slots | Remaining player capacity |
| | Average Player Rating | Average Glicko-2 rating of joined players (AoE2 pattern — lets skilled players find competitive matches) |
| | Player Competitive Ranks | Rank tiers of joined players shown in detail panel |
| **Map** | Map Name | Display name |
| | Map Preview / Thumbnail | Visual preview image |
| | Map Size | Dimensions or category (small/medium/large) |
| | Map Tileset / Theater | Temperate, Snow, Desert, etc. (C&C visual theme) |
| | Map Type | Skirmish / Scenario / Random-generated |
| | Map Source | Built-in / Workshop / Custom (so clients know where to auto-download) |
| | Map Player Capacity | The map's designed max players (may differ from server max) |
| **Game rules** | Game Module | Red Alert, Tiberian Dawn, etc. |
| | Game Type / Mode | Casual, Competitive/Ranked, Co-op, Tournament, Custom |
| | Experience Preset | Which balance/AI/pathfinding preset is active (D033/D054) |
| | Victory Conditions | Destruction, capture, timed, scenario-specific |
| | Game Speed | Slow / Normal / Fast |
| | Starting Credits | Initial resource amount |
| | Fog of War Mode | Shroud / Explored / Revealed |
| | Crates | On / Off |
| | Superweapons | On / Off |
| | Tech Level | Starting tech level |
| | Viewable CVars (subset) | Host-selected subset of relevant configuration variables exposed to browser (from D064's `server_config.toml`; not all ~200 parameters — only host-curated "most relevant" settings) |
| **Mods & version** | Engine Version | Exact IC build version |
| | Mod Name + Version | Active mods with version identifiers |
| | Mod Fingerprint / Content Hash | Integrity hash for map + mod content (Spring pattern — prevents join-then-desync) |
| | Mod Compatibility Indicator | Client-side computed: green (have everything) / yellow (auto-downloadable) / red (incompatible) |
| | Pure / Unmodded Flag | Single boolean: completely vanilla (Warzone pattern — instant competitive filter) |
| | Protocol Version | Client compatibility check (Luanti pattern: `proto_min`/`proto_max`) |
| **Network** | Ping / Latency | Round-trip time measured from client |
| | Relay Server Region | Geographic location of the relay (e.g., EU-West, US-East) |
| | Relay Operator | Which community operates the relay |
| | Connection Type | Relayed / Direct / LAN |
| **Trust & access** | Trust Label | `IC Certified` / `IC Casual` / `Cross-Engine Experimental` / `Foreign Engine` (D011) |
| | Public / Private | Open, password-protected, invite-only, or code-only |
| | Community Membership | Which community server(s) the game is listed on, with verified badges/icons/logos |
| | Community Tags | Official game, clan-specific, tournament bracket, etc. |
| | Custom Icons / Logos | Verified community branding; custom host icons (with abuse prevention — see D052) |
| | Minimum Rank Requirement | Entry barrier (Spring pattern — host can require minimum experience) |
| **Communication** | Voice Chat | Enabled / Disabled (D059) |
| | Language | Global (Mixed), English, Russian, etc. — self-declared by host |
| | AllChat Policy | Whether cross-team chat is enabled |
| **Tournament** | Tournament ID / Name | If part of an organized tournament |
| | Bracket Link | Link to tournament bracket |
| | Shoutcast / Stream URL | Link to a live stream of this game |

**Filters & sorting:**

- Filter by: game module (RA/TD), map name/size/type, mod (specific or "unmodded only"), game type (casual/competitive/co-op/tournament), player count, ping range, community, password-protected, voice enabled, language, trust label, has open slots, spectatable, compatible mods (green indicator), minimum/maximum average rating, tags (include/exclude)
- Sort by: any column (room name, host, players, map, ping, rating, game type)
- Auto-refresh on configurable interval

**Client-side browser organization** (persistent across sessions, stored in local SQLite per D034):

| Feature | Description |
|---------|-------------|
| **Favorites** | Bookmark servers/communities for quick access |
| **History** | Recently visited servers |
| **Blacklist** | Permanently hide servers (anti-abuse) |
| **Friends' Games** | Show games where friends are playing (if friends list implemented) |
| **LAN** | Automatic local network discovery tab |
| **Community Subscriptions** | Show games only from subscribed communities |
| **Quick Join** | Auto-join best matching game based on saved preferences, ping, and rating |

### Ranked Matchmaking Flow

```
Multiplayer Hub → Find Match
```

```
┌──────────────────────────────────────────────────────────┐
│  FIND MATCH                                  [← Back]    │
│                                                          │
│  Queue: [Ranked 1v1 ▾]                                   │
│                                                          │
│  Your Rating: Captain II (1623 ± 48)                     │
│  Season 3: 42 days remaining                             │
│                                                          │
│  Map Pool:                                               │
│  ☑ Coastal Fortress  ☑ Glacier Bay  ☑ Desert Arena       │
│  ☑ Ore Fields        ☐ Tundra Pass  ☑ River War          │
│  (Veto up to 2 maps)                                     │
│                                                          │
│  Balance: IC Default (locked for ranked)                 │
│  Pathfinding: IC Default (locked for ranked)             │
│                                                          │
│                    [Find Match]                           │
│                                                          │
│  Estimated wait: ~30 seconds                             │
└──────────────────────────────────────────────────────────┘
```

**Ranked flow:**

```
Find Match → Searching... → Match Found → Ready Check (30s)
  ├─ Accept → Map Veto (ranked) → Loading → InGame
  └─ Decline → Back to queue (with escalating cooldown penalty)
```

**Ready Check** — Center-screen overlay. Accept/Decline. 30-second timer. Both players must accept. Decline or timeout = back to queue with cooldown.

**Map Veto** (ranked only) — Anonymous opponent (no names shown until game starts). Each player vetoes from the map pool. Remaining maps are randomly selected. 30-second timer.

### Lobby

```
Game Browser → Join Game
  — or —
Multiplayer Hub → Create Game
  — or —
Join Code → Enter code
  — or —
Direct Connect → Enter IP
```

```
┌──────────────────────────────────────────────────────────────┐
│  GAME LOBBY     Trust: IC Certified    Code: IRON-7K3M       │
│                                                              │
│  ┌──────────────────┐  ┌──────────────────────────────────┐ │
│  │ MAP              │  │ PLAYERS                           │ │
│  │ [preview]        │  │                                   │ │
│  │                  │  │ 1. HostPlayer (Allied) [Ready ✓]  │ │
│  │ Coastal Fortress │  │ 2. You (Soviet) [Not Ready]       │ │
│  │ 2-4 players      │  │ 3. [Open Slot]                    │ │
│  │ [Change Map]     │  │ 4. [Add AI / Close]               │ │
│  └──────────────────┘  └──────────────────────────────────┘ │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ GAME SETTINGS (host controls)                         │   │
│  │ Balance: [IC Default ▾]  Speed: [Normal ▾]            │   │
│  │ Fog: [Shroud ▾]  Crates: [On ▾]  Starting $: [10k ▾] │   │
│  │ Mods: vanilla (fingerprint: a3f2...)                   │   │
│  │ Engine: Iron Curtain  Netcode: IC Relay (Certified)    │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ CHAT                                                  │   │
│  │ HostPlayer: gl hf                                     │   │
│  │ > _                                                   │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  [Ready]  [Leave]      Share: [Copy Code] [Copy Link]        │
│                                                              │
│  ⚠ Downloading: combined-arms-v2.1 (2.3 MB)... 67%         │
└──────────────────────────────────────────────────────────────┘
```

**Key interactions:**

- **Player slots** — Click to change faction, color, team. Host can rearrange/kick.
- **Ready toggle** — All players must be Ready before the host can start. Host clicks "Start Game" when all ready.
- **Mod fingerprint** — If mismatched, a diff panel shows: "You're missing mod X" / "Update mod Y" with [Auto-Download] buttons (D030/D062). Download progress bar in lobby.
- **Chat** — Text chat within the lobby. Voice indicators if VoIP is active (D059).
- **Share** — Copy join code (`IRON-7K3M`) or deep link for Discord/Steam.
- **Spectator slots** — Visible if enabled. Join as spectator option.
- **Trust label** — Lobby header and join dialog show trust/certification status (`IC Certified`, `IC Casual`, `Cross-Engine Experimental`, `Foreign Engine`) before Ready.

**Additional lobby-visible metadata** (shown in lobby header, detail panel, or game settings area):

- **Dedicated / Listen indicator** — shows whether this is a dedicated server or a player-hosted listen server (with host account name)
- **MOTD (Message of the Day)** — optional host-set message displayed on join (e.g., community rules, welcome text)
- **Description** — optional free-text description visible in a detail panel
- **Voice chat status** — enabled/disabled indicator with mic icon (D059)
- **Language** — self-declared lobby language (Global/Mixed, English, Russian, etc.)
- **Victory conditions** — destruction, capture, timed, scenario-specific
- **Superweapons** — on/off toggle (classic C&C setting, visible alongside crates/fog)
- **Tech level** — starting tech level
- **Experience preset name** — which named preset is active (D033/D054), shown alongside balance/speed
- **Game type badge** — casual, competitive, co-op, tournament (visible in lobby header alongside trust label)
- **Community branding** — verified community icons/logos in lobby header if the game is hosted under a specific community (D052)
- **Relay region** — geographic location of the relay server (e.g., EU-West)
- **Replay recording indicator** — whether the match will be recorded

**Lobby → Game transition:** Host clicks "Start Game" → all clients enter Loading state → per-player progress bars → 3-second countdown → InGame.

#### Lobby Trust Labels & Cross-Engine Warnings (D011 / `07-CROSS-ENGINE`)

When browsing mixed-engine/community listings, the lobby/join flow must clearly label trust and anti-cheat posture. Shared browser visibility does **not** imply equal gameplay integrity or ranked eligibility.

```
┌──────────────────────────────────────────────────────────────────────┐
│  JOIN GAME?                                                          │
│  OpenRA Community Lobby — "Desert Arena 2v2"                         │
│                                                                      │
│  Engine: OpenRA                 Trust: Foreign Engine                │
│  Mode: Cross-Engine Experimental (Level 0 browser / no live join)   │
│  Anti-Cheat: External / community-specific                           │
│  Ranked / Certification: Not eligible in IC                          │
│                                                                      │
│  [View Details] [Browse Map/Mods] [Open With Compatible Client]      │
│  [Cancel]                                                            │
└──────────────────────────────────────────────────────────────────────┘
```

**Label semantics (player-facing):**
- **`IC Certified`** — IC relay + certified match path; ranked-eligible when mode/rules permit
- **`IC Casual`** — IC-hosted/casual path; IC rules apply but not a certified ranked session
- **`Cross-Engine Experimental`** — compatibility feature; may include drift correction and reduced anti-cheat guarantees; unranked by default
- **`Foreign Engine`** — external engine/community trust model; IC can browse/discover/analyze but does not claim IC anti-cheat guarantees

**UX rules:**
- trust label is shown in browser cards, lobby header, and start/join confirmation
- ranked/certified restrictions are explicit before Ready/Start
- warnings describe capability differences without implying "unsafe" if simply non-IC-certified

#### Asymmetric Co-op Lobby Variant (D070 Commander & Field Ops / Player-Facing "Commander & SpecOps")

For D070 `Commander & Field Ops` scenarios/templates, the lobby adds **role slots** and **role readiness previews** on top of the standard player-slot system.

```
┌──────────────────────────────────────────────────────────────────────┐
│  COMMANDER & SPECOPS LOBBY                             Code: OPS-4N2 │
│                                                                      │
│  ROLE SLOTS                                                          │
│  [Commander]  HostPlayer      [Ready ✓]   HUD: commander_hud         │
│  [SpecOps Lead] You           [Not Ready] HUD: field_ops_hud         │
│  [Observer]   [Open Slot]                                              │
│                                                                      │
│  MODE CONFIG                                                         │
│  Objective Lanes: Strategic + Field + Joint                          │
│  Field Progression: Match-Based Loadout (session only)               │
│  Portal Micro-Ops: Optional                                           │
│  Support Catalog: CAS / Recon / Reinforcements / Extraction          │
│                                                                      │
│  [Preview Commander HUD]  [Preview SpecOps HUD]  [Role Help]         │
│                                                                      │
│  [Ready] [Leave]                                                     │
└──────────────────────────────────────────────────────────────────────┘
```

**Key additions (D070):**
- role slot assignment (`Commander`, `Field Ops`; `CounterOps` variants are proposal-only, not scheduled — see D070 post-v1 expansion notes)
- role HUD preview / help before match start
- role-specific readiness validation (required role slots filled before start)
- quick link to D065 role onboarding / Controls Quick Reference
- optional casual/custom drop-in policy for open `FieldOps` (`SpecOps`) role slots (scenario/host controlled)

#### Experimental Survival Lobby Variant (D070-adjacent `Last Commando Standing` / `SpecOps Survival`) — Proposal-Only, `M10+`, `P-Optional`

> **Deferral classification:** This variant is **proposal-only** (not scheduled). It requires D070 baseline co-op to ship and be validated first. Promotion to planned work requires prototype playtest evidence and a separate scheduling decision. See D070 § "D070-Adjacent Mode Family" for validation criteria.

For the D070-adjacent experimental survival variant, the lobby emphasizes **squad start**, **hazard profile**, and **round rules** rather than commander/field role slots.

```
┌──────────────────────────────────────────────────────────────────────┐
│  LAST COMMANDO STANDING (EXPERIMENTAL)                 Code: LCS-9Q7 │
│                                                                      │
│  PLAYERS / TEAMS                                                     │
│  [Team 1] You + Open Slot      Squad Preset: SpecOps Duo            │
│  [Team 2] PlayerX + PlayerY    Squad Preset: Raider Team            │
│  [Team 3] [Open Slot]          Squad Preset: Random (Host Allowed)  │
│                                                                      │
│  ROUND RULES                                                         │
│  Victory: Last Team Standing                                         │
│  Hazard Profile: Chrono Distortion (Phase Timer: 3:00)              │
│  Neutral Objectives: Caches / Power Relays / Tech Uplinks           │
│  Elimination Policy: Spectate + Optional Redeploy Token             │
│  Progression: Match-Based Field Upgrades (session only)             │
│                                                                      │
│  [Preview Hazard Phases] [Objective Rewards] [Mode Help]            │
│                                                                      │
│  [Ready] [Leave]                                                     │
└──────────────────────────────────────────────────────────────────────┘
```

**Key additions (D070-adjacent survival):**
- squad/team composition presets instead of base-role slot assignments
- hazard contraction profile preview (`radiation`, `artillery`, `chrono`, etc.)
- neutral objective/reward summary (what is worth contesting)
- explicit elimination/redeploy policy before match start
- prototype-first labeling in UI (`Experimental`) to set expectations

#### Commander Avatar / Assassination Lobby Variant (D070-adjacent, TA-style) — Proposal-Only, `M10+`, `P-Optional`

> **Deferral classification:** This variant is **proposal-only** (not scheduled). It requires D070 baseline co-op validation and D038 template integration. Promotion to planned work requires prototype playtest evidence. See D070 § "D070-Adjacent Mode Family" for validation criteria.

For D070-adjacent commander-avatar scenarios (for example `Assassination`, `Commander Presence`, or hybrid presets), the lobby emphasizes **commander survival rules**, **presence profile**, and **command-network map rules**.

```
┌──────────────────────────────────────────────────────────────────────┐
│  ASSASSINATION (COMMANDER AVATAR)                     Code: CMD-7R4 │
│                                                                      │
│  PLAYERS / TEAMS                                                     │
│  [Team 1] HostPlayer     Commander Avatar: Allied Field Commander    │
│  [Team 2] You            Commander Avatar: Soviet Front Marshal      │
│                                                                      │
│  COMMANDER RULES                                                     │
│  Commander Mode: Assassination + Presence                            │
│  Defeat Policy: Downed Rescue Timer (01:30)                          │
│  Presence Profile: Forward Command (CAS/recon + local aura)          │
│  Command Network: Comm Towers + Radar Relays Enabled                 │
│                                                                      │
│  [Preview Commander Rules] [Counterplay Tips] [Mode Help]            │
│                                                                      │
│  [Ready] [Leave]                                                     │
└──────────────────────────────────────────────────────────────────────┘
```

**Key additions (Commander Avatar / Assassination):**
- commander avatar identity/role preview (which unit matters)
- explicit defeat policy (instant defeat vs downed rescue timer)
- presence profile summary (what positioning changes)
- command-network rules summary (which map objectives affect command power)
- anti-snipe/counterplay hinting before match start

### Loading Screen

```
Lobby → [All Ready] → Start Game → Loading
```

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│                    COASTAL FORTRESS                       │
│                                                          │
│               [campaign-themed artwork]                   │
│                                                          │
│  Loading map...                                          │
│  ████████████████░░░░░░░░░░  67%                        │
│                                                          │
│  Player 1: ████████████████████████ Ready                │
│  Player 2: ████████████████░░░░░░░░ 72%                 │
│                                                          │
│  TIP: Hold Ctrl and click to force-fire on the ground.   │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

- Per-player progress bars (multiplayer)
- 120-second timeout — player kicked if not loaded
- Loading tips (from `loading_tips.yaml`, moddable)
- Campaign-themed background for campaign missions
- All players loaded → 3-second countdown → game starts
