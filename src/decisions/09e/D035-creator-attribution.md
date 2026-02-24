## D035: Creator Recognition & Attribution

**Decision:** The Workshop supports **voluntary creator recognition** through tipping/sponsorship links and reputation badges. Monetization is never mandatory — all Workshop resources are freely downloadable. Creators can optionally accept tips and link sponsorship profiles.

**Rationale:**
- The C&C modding community has a 30-year culture of free modding. Mandatory paid content would generate massive resistance and fragment multiplayer (can't join a game if you don't own a required paid map — ArmA DLC demonstrated this problem).
- Valve's Steam Workshop paid mods experiment (Skyrim, 2015) was reversed within days due to community backlash. The 75/25 revenue split (Valve/creator) was seen as exploitative.
- Nexus Mods' Donation Points system is well-received as a voluntary model — creators earn money without gating access.
- CS:GO/CS2's creator economy ($57M+ paid to creators by 2015) works because it's cosmetic-only items curated by Valve — a fundamentally different model than gating gameplay content.
- ArmA's commissioned mod ecosystem exists in a legal/ethical gray zone with no official framework — creators deserve better.
- Backend infrastructure (relay servers, Workshop servers, tracking servers) has real hosting costs. Sustainability requires some revenue model.

**Key Design Elements:**

### Creator Tipping

- **Tip jar on resource pages:** Every Workshop resource page has an optional "Support this creator" button. Clicking shows the creator's configured payment links.
- **Payment links, not payment processing.** IC does not process payments directly. Creators link their own payment platforms:

```yaml
# In mod.yaml or creator profile
creator:
  name: "Alice"
  tip_links:
    - platform: "ko-fi"
      url: "https://ko-fi.com/alice"
    - platform: "github-sponsors"
      url: "https://github.com/sponsors/alice"
    - platform: "patreon"
      url: "https://patreon.com/alice"
    - platform: "paypal"
      url: "https://paypal.me/alice"
```

- **No IC platform fee on tips.** Tips go directly to creators via their chosen platform. IC takes zero cut.
- **Aggregate tip link on creator profile:** Creator's profile page shows a single "Support Alice" button linking to their preferred platform.

### Infrastructure Sustainability

The Workshop and backend servers have hosting costs. Sustainability options (not mutually exclusive):

| Model                        | Description                                                                                                   | Precedent                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| **Community donations**      | Open Collective / GitHub Sponsors for the project itself                                                      | Godot, Blender, Bevy                |
| **Premium hosting tier**     | Optional paid tier: priority matchmaking queue, larger replay archive, custom clan pages                      | Discord Nitro, private game servers |
| **Sponsored featured slots** | Creators or communities pay to feature resources in the Workshop's "Featured" section                         | App Store featured placements       |
| **White-label licensing**    | Tournament organizers or game communities license the engine+infrastructure for their own branded deployments | Many open-source projects           |

**No mandatory paywalls.** The free tier is fully functional — all gameplay features, all maps, all mods, all multiplayer. Premium tiers offer convenience and visibility, never exclusive gameplay content.

**No loot boxes, no skin gambling, no speculative economy.** CS:GO's skin economy generated massive revenue but also attracted gambling sites, scams, and regulatory scrutiny. IC's creator recognition model is direct and transparent.

### Future Expansion Path

The Workshop schema supports monetization metadata from day one, but launches with tips-only:

```yaml
# Deferred schema extension (not implemented at launch; `M11+`, separate monetization policy decision)
mod:
  pricing:
    model: "free"                    # free | tip | paid (paid = deferred optional `M11+`)
    tip_links: [...]                 # voluntary compensation
    # price: "2.99"                  # deferred optional `M11+`: premium content pricing
    # revenue_split: "70/30"         # deferred optional `M11+`: creator/platform split
```

If the community evolves toward wanting paid content (e.g., professional-quality campaign packs), the schema is ready. But this is a community decision, not a launch feature.

**Alternatives considered:**
- Mandatory marketplace (Skyrim paid mods disaster — community backlash guaranteed)
- Revenue share on all downloads (creates perverse incentives, fragments multiplayer)
- No monetization at all (unsustainable for infrastructure; undervalues creators)
- EA premium content pathway (licensing conflicts with open-source, gives EA control the community should own)

**Phase:** Phase 6a (integrated with Workshop infrastructure), with creator profile schema defined in Phase 3.

---

---
