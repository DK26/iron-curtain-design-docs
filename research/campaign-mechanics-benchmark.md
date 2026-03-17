# Campaign Mechanics Benchmarking Analysis

This document analyzes Iron Curtain's proposed campaign mechanics against historical successes and failures from eight closely related benchmark games: *XCOM 2: War of the Chosen*, *Total War*, *Into the Breach*, *Jagged Alliance 2*, *Operation Flashpoint: Cold War Crisis*, *Darkest Dungeon*, *FTL: Faster Than Light*, and *Company of Heroes*.

## 1. Expiring Opportunities & The World Map
**IC Implementation:** A living map board with 2-4 active operations. Launching optional missions costs "Command Authority" (action points). Timers (`expires_in_phases`) tick down only when the player advances the main campaign phase. 

**Benchmark Lessons:**
*   **XCOM 2:** Vanilla XCOM 2 relied heavily on strict, unforgiving combat timers, which frustrated players. *War of the Chosen* gave players ways to manipulate these timers (e.g., destroying nodes to buy time, or the timer only starting when concealed status broke). **Takeaway for IC:** Keep the tension on the *strategic layer* (Command Authority vs. expiring operations) rather than strict countdowns inside the tactical missions themselves unless explicitly telegraphed (like the M8 Chronosphere storm).
*   **FTL:** Scarcity drives choice. You can't visit every beacon before the Rebel Fleet catches you. **Takeaway for IC:** Command Authority must remain genuinely scarce. If the player ever has enough CA to do *every* optional mission before the phase advances, the system collapses. The opportunity cost of *not* doing a mission is the core driver of tension.

## 2. Unit Persistence & Veterancy
**IC Implementation:** Surviving units carry forward with their veterancy status. Capturing tech (e.g., Chrono Tanks) adds them to the persistent roster for future missions.

**Benchmark Lessons:**
*   **Total War (Cautionary Tale):** Unchecked veterancy and stacking stat buffs lead to "doomstacks"—armies so powerful the late game becomes a tedious, unchallenging victory lap. Furthermore, replenishing heavily damaged veteran units dilutes their veterancy, forcing a choice between numbers and elite status.
*   **Company of Heroes (Success):** Veterancy works best when it unlocks *utility and new behaviors* (e.g., new abilities, reduced suppression, faster reloads) rather than just flat health/damage inflation. Players form intense emotional bonds with surviving squads.
*   **Takeaway for IC:** We must cap veterancy power to prevent doomstacks. IC's engine is built for fixed-point deterministic logic. A 3-chevron Heavy Tank shouldn't have 300% HP; it should fire slightly faster, auto-heal slowly out of combat, or gain a minor speed boost. Crucially, if IC allows *replenishing* units between missions, we need a mechanic where flooding an elite tank platoon with green recruits lowers the average experience, forcing the player to value preservation over brute-forcing victories.

## 3. Threat Telegraphing & "Unchosen Effects"
**IC Implementation:** The campaign highlights what the enemy is doing (e.g., "Sarin Gas deployment nearing completion"). Skipping an optional mission has a concrete `unchosen_effect`, such as facing artillery barrages in the next main mission.

**Benchmark Lessons:**
*   **Into the Breach:** The entire game is built on perfect telegraphing. You know *exactly* what the enemy will do next turn, making any damage taken feel like the player's fault, not RNG. 
*   **Takeaway for IC:** The current IC design (Rule 3: brief player precisely on `On Success`, `On Failure`, `If Skipped`, and `Time Window`) is perfectly aligned with this. The player should never be subjected to a hidden "gotcha" consequence for skipping a mission. The 'Enemy Initiatives' system and 'Doomsday Clock' must be loud and transparent.

## 4. Branching Outcomes & "Fail Forward"
**IC Implementation:** IC missions don't default to a "Game Over" screen on failure. A defeat outcome is just another edge in the graph, pushing the player down a harder path or forcing a rescue operation. 

**Benchmark Lessons:**
*   **Operation Flashpoint:** Mastered the art of branching consequences. Failing to hold a town didn't end the game; it meant the next mission was a desperate retreat through the woods. It valued survival and adaptability over perfection.
*   **Takeaway for IC:** To make "fail forward" work, the fallback missions (the failure branches) must be fun and wildly different from the success path. If you fail to protect Tanya and she is captured, the ensuing rescue mission shouldn't feel like a punishment—it should feel like an exciting jailbreak set-piece. This strongly discourages save-scumming, as the failure path is just as authored and interesting as the success path.

## 5. Roster Fatigue & The "A-Team" Problem
**IC Implementation:** Hero units (Tanya, Volkov) have skill trees and persistent progression. 

**Benchmark Lessons:**
*   **Darkest Dungeon / XCOM 2 WotC:** Both games recognized that if players can use their best units every time, they will. They introduced *Fatigue* and *Stress* as secondary health bars that require rest/time to heal. This forces the player to develop a deep bench ("B-Team" and "C-Team") rather than relying entirely on a hyper-leveled core squad.
*   **Takeaway for IC:** If Tanya or elite Commando units can be used in *every* optional SpecOps mission, the player will over-rely on them to snowball the campaign. IC should consider a soft "fatigue" or "deployment cooldown" for named heroes or specialized assets in the War Table. If you send Tanya on an Intel Raid in Phase 2, she might be unavailable for the Tech Theft opportunity in Phase 3 because she is recovering or travelling. This forces the use of standard forces or secondary heroes.

## Summary Recommendations for Iron Curtain:
1. **Veterancy Dilution:** Implement a mechanic where reinforcing persistent veteran vehicle squads between missions costs Requisition *and* heavily dilutes their veterancy level. Pure preservation must be rewarded.
2. **Hero Deployment Cooldowns:** To compel diverse strategies, named heroes (Tanya, Volkov) or high-value captured tech (Chrono Tanks) used in an optional SpecOps mission should have a "cooldown" phase before they can be deployed again, preventing the "A-Team" snowball effect.
3. **Hard Caps on Command Authority:** Validate that the math behind Command Authority economy never accidentally allows a player to clear the entire map board. The tension relies entirely on the agony of choice.
