## Workshop

### Workshop Browser

```
Main Menu → Workshop
```

```
┌──────────────────────────────────────────────────────────────┐
│  WORKSHOP                                        [← Back]    │
│                                                              │
│  🔎 Search...  [All ▾] [Category ▾] [Sort: Popular ▾]       │
│                                                              │
│  Categories: Maps | Mods | Campaigns | Themes | AI Presets   │
│  | Music | Sprites | Voice Packs | Scripts | Tutorials       │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ 🗺 Desert Showdown Map Pack           ★★★★½  12.4k ↓   │ │
│  │    by MapMaster ✓  |  3 maps, 4.2 MB  |  [Install]    │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │ 🎮 Combined Arms v2.1                 ★★★★★  8.7k ↓   │ │
│  │    by CombinedArmsTeam ✓  |  Total conversion  |      │ │
│  │    [Installed ✓] [Update Available]                    │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │ 🎵 Synthwave Music Pack               ★★★★   3.1k ↓   │ │
│  │    by AudioCreator  |  12 tracks  |  [Install]         │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  [My Content →]  [Installed →]  [Publishing →]               │
└──────────────────────────────────────────────────────────────┘
```

**Resource detail page** (click any item):

- Description, screenshots/preview, license (SPDX), author profile link
- Download count, rating, reviews
- Dependency tree (visual), changelog
- [Install] / [Update] / [Uninstall]
- [Report] for DMCA/policy violations
- [Tip Creator →] if creator has a tip link (D035)

**My Content** (Workshop → My Content):

- Disk management dashboard (D030): pinned/transient/expiring resources with sizes, TTL, and source
- Bulk actions: pin, unpin, delete, redownload
- Storage used / cleanup recommendations
- If the player is a creator: **Feedback Inbox** for owned resources (triage reviews as `Helpful`, `Needs follow-up`, `Duplicate`, `Not actionable`)
- Helpful-review marks show anti-abuse/trust notices and only grant **profile/social** recognition to reviewers (no gameplay rewards)
- If community contribution rewards are enabled (`M10` badges/reputation; `M11` optional points): creator inbox/helpful-mark UI may show badge/reputation/points outcomes, but labels must remain **non-gameplay / profile-only**

### Mod Profile Manager

```
Workshop → Mod Profiles
  — or —
Settings → Mod Profiles
```

```
┌──────────────────────────────────────────────────────────┐
│  MOD PROFILES                                [← Back]    │
│                                                          │
│  Active: IC Default (vanilla)                            │
│  Fingerprint: a3f2c7...                                  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │  ► IC Default (vanilla)              [Active ✓]    │ │
│  │  ► Combined Arms v2.1 + HD Sprites   [Activate]    │ │
│  │  ► Tournament Standard               [Activate]    │ │
│  │  ► My Custom Mix                     [Activate]    │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  [New Profile]  [Import from Workshop]  [Diff Profiles]  │
└──────────────────────────────────────────────────────────┘
```

One-click profile switching reconfigures mods AND experience settings (D062).

### Feature Smart Tips (D065 Layer 2)

First-visit and contextual tips appear on Workshop screens via the `feature_discovery` hint category. Tips cover: what the Workshop is (first visit), what categories mean, how to install content, what mod profiles and fingerprints do, how dependencies work, and how My Content disk management works. See D065 § Feature Smart Tips (`hints/feature-tips.yaml`) for the full hint catalog and trigger definitions.
