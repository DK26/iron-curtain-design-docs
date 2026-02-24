## Platform Adaptations

The flow described above is the Desktop experience. Other platforms adapt the same flow to their input model:

| Platform              | Layout Adaptation                     | Input Adaptation                                              |
| --------------------- | ------------------------------------- | ------------------------------------------------------------- |
| **Desktop** (default) | Full sidebar, mouse precision UI      | Mouse + keyboard, edge scroll, hotkeys                        |
| **Steam Deck**        | Same as Desktop, larger touch targets | Gamepad + touchpad, PTT mapped to shoulder button             |
| **Tablet**            | Sidebar OK, touch-sized targets       | Touch: context tap + optional command rail, one-finger pan + hold-drag box select, pinch-zoom, minimap-adjacent camera bookmark dock |
| **Phone**             | Bottom-bar layout, build drawer, compact minimap cluster | Touch (landscape): context tap + optional command rail, one-finger pan + hold-drag box select, pinch-zoom, bottom control-group bar, minimap-adjacent camera bookmark dock, mobile tempo advisory |
| **TV**                | Large text, gamepad radial menus      | Gamepad: D-pad navigation, radial command wheel               |
| **Browser (WASM)**    | Same as Desktop                       | Mouse + keyboard, WebRTC VoIP                                 |

`ScreenClass` (Phone/Tablet/Desktop/TV) is detected automatically. `InputCapabilities` (touch, mouse, gamepad) drives interaction mode. The player flow stays identical — only the visual layout and input bindings change.

For touch platforms, the HUD is arranged into mirrored thumb-zone clusters (left/right-handed toggle): command rail on the dominant thumb side, minimap/radar in the opposite top corner, and a camera bookmark quick dock attached to the minimap cluster. Mobile tempo guidance appears as a small advisory chip near speed controls in single-player and casual-hosted contexts, but never blocks the player from choosing a faster speed.

---

