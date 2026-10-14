---
'mysa-js-sdk': minor
'mysa2mqtt': minor
---

Send set point and mode changes through Mysa's REST API when a thermostat's MQTT topic rejects them. On some accounts,
AWS IoT now drops the connection on every publish to a device, so temperature and mode changes from Home Assistant
failed with `AWS_ERROR_MQTT_UNEXPECTED_HANGUP` while status updates kept working. After the first rejected publish,
commands for that device go straight to the REST API, and the periodic status keep-alive that would keep dropping the
connection is no longer sent to it. The SDK also gains `getDeviceShadowState()` to read a device's structured state.
