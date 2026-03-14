## D059 — In-Game Communication System

> **Keywords:** text chat, VoIP, voice chat, Opus, pings, beacons, tactical markers, chat wheel, minimap drawing, voice-in-replay, tactical coordination, relay voice, spatial audio, jitter buffer, voice effects

Text chat channels, relay-forwarded Opus VoIP, contextual ping system (Apex-inspired), chat wheel with auto-translated phrases, minimap drawing, tactical markers, smart danger alerts, and voice-in-replay.

| Section | Topic | File |
|---------|-------|------|
| Overview, Text Chat & VoIP Core | Problem, decision, capsule, text chat (channel model, routing, emoji/rich text), VoIP intro (design principles, Opus codec, adaptive bitrate, message lane, voice packet format) | [D059-overview-text-chat-voip-core.md](D059/D059-overview-text-chat-voip-core.md) |
| VoIP Relay & Moderation | Relay voice forwarding, spatial audio, browser/WASM VoIP, muting & moderation, player reports, jitter buffer, UDP/TCP fallback, audio preprocessing pipeline | [D059-voip-relay-moderation.md](D059/D059-voip-relay-moderation.md) |
| VoIP Effects & ECS | Voice effects & enhancement (radio filter, underwater, scramble, proximity, faction voice, custom WASM effects, performance budget), ECS integration & audio thread architecture, UI indicators, competitive voice rules | [D059-voip-effects-ecs.md](D059/D059-voip-effects-ecs.md) |
| Beacons & Coordination | Beacons & tactical pings (types, contextual pings, ping wheel, properties, colors/labels, RTL/BiDi), novel coordination mechanics (chat wheel, minimap drawing, tactical markers, smart danger alerts) | [D059-beacons-coordination.md](D059/D059-beacons-coordination.md) |
| Replay, Requests & Integration | Voice-in-replay (architecture, storage, consent), security, platform considerations, Lua API extensions, console commands, tactical coordination requests, role-aware presets (D070), alternatives considered, integration, shared infrastructure | [D059-replay-requests-integration.md](D059/D059-replay-requests-integration.md) |
