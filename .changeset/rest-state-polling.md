---
'mysa2mqtt': minor
---

Poll device state over REST periodically so Home Assistant stays current even when the real-time AWS IoT connection cannot be established (e.g. all-Lite fleets, whose WebSocket handshake fails with `AWS_ERROR_HTTP_WEBSOCKET_UPGRADE_FAILURE`) or is chronically unstable (e.g. INF-V1). Previously these fleets only ever received the single state snapshot taken at startup, then froze.

A single account-wide poll refreshes every thermostat, so the request cost does not grow with fleet size. Configure the cadence with `--poll-interval-seconds` (`M2M_POLL_INTERVAL_SECONDS`), which defaults to 60 seconds; set it to 0 to disable, or to at least 30.
