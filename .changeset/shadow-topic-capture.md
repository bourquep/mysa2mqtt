---
'mysa-js-sdk': minor
'mysa2mqtt': minor
---

Add a `mysa2mqtt-capture` tool (and the underlying `MysaApiClient.startRawTopicCapture()` SDK method) to record the raw AWS IoT Device Shadow traffic of unsupported thermostats, most notably the central-HVAC ST-V1.

Unlike the real-time path, `startRawTopicCapture()` subscribes to arbitrary MQTT topic filters and relays every message verbatim (full topic + decoded payload) with no parsing, re-subscribing across reconnects. The `mysa2mqtt-capture` command uses it to dump a device's REST metadata and passively record every shadow message to a file, providing the raw material needed to implement support for a new device family. Run `npm run capture -w mysa2mqtt -- --help` for usage.
