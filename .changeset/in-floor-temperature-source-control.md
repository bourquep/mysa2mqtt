---
'mysa-js-sdk': minor
'mysa2mqtt': minor
---

Choose which sensor an in-floor heating thermostat (INF-V1-0) regulates against, from Home Assistant.

These units have both an ambient air sensor and a floor probe. mysa2mqtt already reported which one the thermostat was
tracking; now it can change it. In-floor thermostats gain a **Temperature source** dropdown with `Ambient` and `Floor`
options, and picking one applies the setting to the device itself — the same change the Mysa app makes, so it also
changes what the thermostat heats to. Changing it in the app updates the dropdown within a few seconds.

The SDK gains `MysaApiClient.setTrackedSensor(deviceId, sensor)`, which sends the `tr` command field decoded from the
Mysa app's own traffic, and rejects devices that have no floor probe with a new `UnsupportedTrackedSensorError`. The
device's acknowledgement is surfaced as `StateChange.trackedSensor`, so a change is reflected in about a second rather
than waiting for the next periodic status message.
