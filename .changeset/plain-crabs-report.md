---
'mysa-js-sdk': patch
---

Fixed `startRealtimeUpdates` hanging forever when the Mysa broker silently ignores a `START_PUBLISHING_DEVICE_STATUS`
publish. QoS1 publishes now time out after 30 seconds if no acknowledgement arrives (observed in production since July
2026: the broker drops these publishes without a PUBACK, and the client's 60s protocol operation timeout never fires). A
failed status-publishing request no longer aborts realtime startup and a failed keep-alive no longer surfaces as an
unhandled rejection — both are logged as warnings, since the device's autonomous periodic status reports (message
type 30) keep flowing over the subscription either way.
