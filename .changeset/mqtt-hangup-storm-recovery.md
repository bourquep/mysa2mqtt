---
'mysa-js-sdk': patch
---

Harden the MQTT connection against `AWS_ERROR_MQTT_UNEXPECTED_HANGUP` interrupt storms (#178).

- Switch to clean MQTT sessions so the broker no longer redelivers a backlog of queued QoS1 messages on reconnect (the source of the ~1000x message bursts and exponential Home Assistant database growth) and so forced resets no longer leave orphaned broker sessions.
- Make the forced connection reset repeatable with exponential backoff instead of one-shot, so a persistent storm keeps recovering (fresh client id + fresh credentials) rather than giving up.
- Tag each connection with a generation and ignore events from discarded connections, and ensure the reset never rejects — preventing the in-flight publish crash (`AWS_ERROR_MQTT_CONNECTION_DESTROYED`) that terminated the process.
- Add interrupt dwell-time and session diagnostics to help pin down the server-side hangup trigger.
