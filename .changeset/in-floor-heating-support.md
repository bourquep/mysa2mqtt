---
'mysa-js-sdk': minor
---

Support Mysa in-floor heating thermostats (INF-V1-0) (#94).

- Parse the in-floor-specific status fields — floor-probe temperature (`flrSnsrTemp`), binary heating-relay state (`heatStat`), tracked sensor (`trackedSnsr`) and line voltage (`lineVtg`) — which share the V2 status message type (`msg: 40`). `heatStat` maps onto the emitted `dutyCycle`, and the floor-probe reading is surfaced as a new `Status.floorTemperature`.
- Send the correct control command `type` (3) for in-floor thermostats so setpoint and mode changes take effect instead of being silently ignored.
