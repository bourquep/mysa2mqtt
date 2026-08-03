---
'mysa-js-sdk': minor
'mysa2mqtt': minor
---

Follow the temperature sensor an in-floor heating thermostat (INF-V1-0) is set to regulate against.

These units have both an ambient air sensor and a floor probe, and the Mysa app lets the owner pick which one the
thermostat tracks — but the climate entity always published the ambient reading. The device reports its selection as the
`trackedSnsr` status field, which the SDK parsed but never surfaced; it is now exposed as `Status.trackedSensor`, and
mysa2mqtt publishes the matching reading as the thermostat entity's current temperature. Picking the floor probe in the
app is all that is needed.

The **Current temperature** and **Floor temperature** sensors are unaffected: each keeps reporting its own probe. The
selection only rides along on real-time status messages, so the ambient reading is used until the first one arrives.
