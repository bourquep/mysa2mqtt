---
'mqtt2ha': minor
---

Implement the remaining Home Assistant MQTT components (#180).

Adds `alarm_control_panel`, `camera`, `cover`, `event`, `fan`, `humidifier`, `image`, `lawn_mower`, `light`, `lock`, `number`, `scene`, `select`, `siren`, `text`, `update`, `vacuum`, `valve` and `water_heater`, completing the set of discoverable entity types. Each follows the existing component conventions: state-only entities extend `Discoverable`, while entities that accept commands extend `Subscriber`, exposing typed configuration interfaces and convenience accessors that publish state and reflect incoming commands.

The `number` component is exported as `NumberEntity` to avoid shadowing the built-in `Number` global.
