---
'mysa2mqtt': minor
---

Add in-floor heating thermostat (INF-V1-0) support (#94).

- Publish a **Floor temperature** sensor for in-floor thermostats, reflecting the floor-probe reading. The ambient air temperature remains the climate's current temperature.
- Estimate power draw for in-floor thermostats from the `--heater-watts` rating (they report a heating-relay state rather than a current draw), gating the **Current power** sensor on that configuration just like V2 thermostats.
