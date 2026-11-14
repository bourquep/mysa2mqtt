---
'mysa-js-sdk': minor
'mysa2mqtt': patch
---

Make the real-time connection more resilient when Mysa's cloud keeps dropping it, and show an in-floor thermostat's
temperature source even when no real-time data arrives.

- A publish that failed because the client itself was rebuilding a dropped connection was mistaken for Mysa refusing
  commands for that thermostat. From then on, the thermostat no longer received the periodic request that keeps it
  streaming live status, which is the only source of an in-floor thermostat's floor temperature. Failures the AWS IoT
  SDK reports as plain strings are now classified correctly, and a retried publish goes through the rebuilt connection
  instead of the discarded one.
- Rebuilding the connection could crash the process when an operation still in flight on the old connection failed.
- In-floor thermostats (INF-V1-0) now publish their **Temperature source** (Ambient/Floor) at startup from the device's
  settings, instead of leaving it unknown until a real-time status message arrives. The SDK exposes the setting as
  `DeviceBase.Tracking` and the new `getDeviceTrackedSensor()` helper.
