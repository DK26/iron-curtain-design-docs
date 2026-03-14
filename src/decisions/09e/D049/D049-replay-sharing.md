### Replay Sharing via P2P

> **Parent:** [D049 — Workshop Asset Formats & Distribution](../D049-workshop-assets.md)

This page documents how `.icrep` replay files are distributed via P2P, complementing the replay UX design in `player-flow/replays.md` and the binary format spec in `formats/save-replay-formats.md`.

---

#### Two Distribution Paths

| Path                     | Trigger                                                 | Transport                             | Retention                                                   | Use Case                                                   |
| ------------------------ | ------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------- |
| **Match ID sharing**     | Player copies Match ID post-game or from replay browser | Relay seed → p2p-distribute swarm     | Relay retention period (default 90 days, D072 configurable) | Sharing a single game with friends/community               |
| **Workshop publication** | Creator publishes replay collection to Workshop         | Full Workshop P2P (D049 distribution) | Permanent (Workshop package)                                | Curated collections ("Best of Season 3", teaching replays) |

#### Match ID Sharing — Detailed Flow

1. **Match completes.** The relay stores the `.icrep` file (all participating clients contributed their order streams during the match). The relay assigns a **Match ID** — a short alphanumeric hash (e.g., `IC-7K3M9X`).

2. **Sharer copies Match ID.** Available in:
   - Post-game summary screen: **[Copy Match ID]** button
   - Replay browser detail panel
   - Player profile → match history

3. **Recipient enters Match ID.** In the replay browser: **[Enter Match ID...]** → text field → the client queries the relay (or any relay that hosted the match) for the replay metadata.

4. **Download.** The relay seeds the `.icrep` file. For popular replays (tournament finals, viral moments), `p2p-distribute` forms a swarm — the relay is the initial seed, and subsequent downloaders become peers. Download priority: `user-requested`.

5. **Verify & add to library.** Client verifies the `.icrep` integrity (header checksum, order stream hash). The replay appears in the local replay browser.

**URL scheme:** `ic://replay/IC-7K3M9X` — registered as an OS URL handler. Clicking this link in a browser or chat client opens IC directly to the replay. If IC is not running, it launches and navigates to the replay viewer.

#### Workshop Replay Collections

Community curators can publish replay packs as Workshop resources:

```yaml
# manifest.yaml for a replay collection
name: "season-3-finals"
publisher: "cral-casters"
version: "1.0.0"
license: "CC-BY-4.0"
description: "All grand final matches from CRAL Season 3"
tags: [replays, competitive, season-3, tournament]
game_modules: [ra]

contents:
  - replays/gf-match1.icrep
  - replays/gf-match2.icrep
  - replays/gf-match3.icrep
  - metadata/commentary-notes.yaml
```

Standard Workshop discovery, dependency resolution, and P2P distribution apply. Replay packs can depend on the mods/maps used in the replays — the Workshop resolves these dependencies so the viewer has the correct content loaded.

#### .icrep and P2P Piece Alignment

The `.icrep` binary format (see `formats/save-replay-formats.md`) uses per-256-tick LZ4-compressed order chunks. P2P piece boundaries should align with these chunk boundaries where practical, enabling:

- **Streaming playback:** A recipient can begin watching a replay before the full file has downloaded, as completed pieces correspond to playable tick ranges
- **Partial sharing:** A player who watched only the first 10 minutes of a replay can seed those pieces to others, even without the complete file

Piece length for replay files follows the standard D049 size-based table: most replays are <5 MB (HTTP-only tier), so P2P applies primarily to large replay collections published as Workshop packages.

#### Privacy Considerations

- **Voice audio:** `.icrep` files can include voice recordings (D059) as an opt-in separate stream. The sharer's voice consent flag is recorded at match time. Replays shared via Match ID inherit the original consent settings — voice audio is only included if all speakers opted in to voice-in-replay.
- **Replay anonymization (D056):** The replay browser offers an anonymization mode that strips player names/identities before sharing. This produces a derivative `.icrep` with anonymized metadata.
- **Ranked vs. private:** Ranked match IDs are public by default (discoverable via match history). Custom/private match IDs are generated only if the host enables sharing in the room settings.

#### Relay Retention & Lifecycle

- **Default retention:** 90 days from match end (server-operator configurable via D072)
- **After expiry:** Only locally-saved copies remain. Players who downloaded the replay via Match ID retain their local copy indefinitely
- **Seed promotion:** If a replay is downloaded frequently (configurable threshold), the relay can promote it to the Workshop seed infrastructure for longer-term availability
- **Storage budget:** Relay operators configure maximum replay storage via `server_config.toml` § `[storage.replays]`. LRU eviction applies when the budget is exceeded, with pinned replays (operator-marked) exempt

#### Phase

- **Phase 2 (`M4`):** `.icrep` format and local replay browser. No P2P sharing yet — replay files are manual file transfers only.
- **Phase 5 (`M8`):** Match ID system via relay. P2P swarm formation for popular replays. URL scheme handler (`ic://replay/`).
- **Phase 6a (`M9`):** Workshop replay collections. Replay packs with dependency resolution.

#### Cross-References

| Topic                                   | Document                                                                                                                                                                                     |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Replay UX (browser, viewer, sharing UI) | [player-flow/replays.md](../../../player-flow/replays.md) § "Replay Sharing"                                                                                                                 |
| .icrep binary format                    | [formats/save-replay-formats.md](../../../formats/save-replay-formats.md)                                                                                                                    |
| P2P distribution protocol               | [D049 § P2P Distribution](D049-p2p-distribution.md)                                                                                                                                          |
| Relay server management & retention     | [D072](../../09b/D072-server-management.md)                                                                                                                                                  |
| Voice-in-replay                         | [D059](../../09g/D059-communication.md)                                                                                                                                                      |
| Replay anonymization                    | [D056](../../09f/D056-replay-import.md)                                                                                                                                                      |
| Data-sharing flows overview             | [architecture/data-flows-overview.md](../../../architecture/data-flows-overview.md)                                                                                                          |
| ML training replay donation (research)  | [research/ml-training-pipeline-design.md](../../../../research/ml-training-pipeline-design.md) § "Source 3: Community Replay Donation" — uses same anonymization infrastructure as this page |
