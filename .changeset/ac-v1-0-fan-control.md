---
"mysa2mqtt": patch
"mysa-js-sdk": patch
---

Fix fan-speed control for AC-V1-0 (CodeNum=1117) thermostats that don't enumerate `SupportedCaps.fanSpeeds`.

These devices declare fan-speed support via `SupportedCaps.keys` (the FanSpeed ACState key, `4`) and report a live `FanSpeed` using canonical `fn` values (`1/2/4/6`), but their generic IR code set omits an explicit `SupportedCaps.fanSpeeds` list. As a result the fan was effectively uncontrollable:

- `buildFanModes` (mysa2mqtt) treated "no `fanSpeeds`" as "no fan support" and advertised only `['auto']`, hiding low/medium/high in Home Assistant.
- `buildFanSpeedSendMap` (mysa-js-sdk) fell back to the legacy `1/3/5/7` map, so a `high` command sent `fn: 7` — a value these canonical devices ignore — leaving the fan stuck at its current speed.

Now:

- `buildFanModes` advertises the canonical AC speeds (`auto/low/medium/high`) when a device omits `fanSpeeds` but declares fan support via `SupportedCaps.keys`.
- `buildFanSpeedSendMap` uses the canonical `1/2/4/6` map for CodeNum=1117 devices without an explicit `fanSpeeds` list.

Verified end-to-end against an AC-V1-0 unit: Home Assistant now advertises `auto/low/medium/high` and every fan command reaches the device (fan speed changes on the thermostat).
