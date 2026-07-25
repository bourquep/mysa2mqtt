---
'mysa-js-sdk': patch
---

Parse the periodic status message (type 17) sent by in-floor heating thermostats (INF-V1-0). These devices publish
their telemetry as message type 17 rather than type 40, so their updates were silently discarded: floor temperature was
never reported and power stayed unknown. The heating relay state (`heatStat`) now drives the reported duty cycle.
