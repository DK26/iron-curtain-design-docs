## Main Menu

The main menu is the hub. Everything is reachable from here. The shellmap plays behind a semi-transparent overlay panel.

### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│                    [ IRON CURTAIN ]                               │
│                    Red Alert                                     │
│                                                                  │
│              ┌─────────────────────────┐                         │
│              │  ► Continue Campaign     │ (if save exists)       │
│              │  ► Campaign              │                         │
│              │  ► Skirmish              │                         │
│              │  ► Multiplayer           │                         │
│              │                          │                         │
│              │  ► Replays               │                         │
│              │  ► Workshop              │                         │
│              │  ► Settings              │                         │
│              │                          │                         │
│              │  ► Profile               │ (bottom group)         │
│              │  ► Encyclopedia          │                         │
│              │  ► Credits               │                         │
│              │  ► Quit                  │                         │
│              └─────────────────────────┘                         │
│                                                                  │
│  [shellmap: live AI battle playing in background]                │
│                                                                  │
│  Iron Curtain v0.1.0        community.ironcurtain.dev    RA 1.0 │
└──────────────────────────────────────────────────────────────────┘
```

### Button Descriptions

| Button                | Action                                                            | Notes                                                                                                       |
| --------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Continue Campaign** | Resumes last campaign from the last completed mission's next node | Only visible if an in-progress campaign save exists. One click to resume.                                   |
| **Campaign**          | Opens Campaign Selection screen                                   | Choose faction (Allied/Soviet), start new campaign, or select saved campaign slot.                          |
| **Skirmish**          | Opens Skirmish Setup screen                                       | Configure a local game vs AI: map, players, settings.                                                       |
| **Multiplayer**       | Opens Multiplayer Hub                                             | Five ways to find a game: Browser, Join Code, Ranked, Direct IP, QR Code.                                   |
| **Replays**           | Opens Replay Browser                                              | Browse saved replays, import foreign replays (.orarep, Remastered).                                         |
| **Workshop**          | Opens Workshop Browser                                            | Browse, install, manage mods/maps/resources from Workshop sources.                                          |
| **Settings**          | Opens Settings screen                                             | All configuration: video, audio, controls, experience profile, data, LLM.                                   |
| **Profile**           | Opens Player Profile                                              | View/edit identity, achievements, stats, friends, community memberships.                                    |
| **Encyclopedia**      | Opens in-game Encyclopedia                                        | Auto-generated unit/building reference from YAML rules.                                                     |
| **Credits**           | Shows credits sequence                                            | Scrolling credits, skippable.                                                                               |
| **Quit**              | Exits to desktop                                                  | Immediate — no "are you sure?" dialog (following the principle that the game respects the player's intent). |

### Contextual Elements

- **Version info** — Bottom-left: engine version, game module version
- **Community link** — Bottom-center: link to community site/Discord
- **Mod indicator** — If a non-default mod profile is active, a small indicator badge shows which profile (e.g., "Combined Arms v2.1")
- **News ticker** (optional, Modern theme) — Community announcements from the configured tracking server(s)
- **Tutorial hint** — For new players: a non-intrusive callout near Campaign or Skirmish saying "New? Try the tutorial → Commander School" (D065, dismissible, appears once)
