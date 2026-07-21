---
'mysa-js-sdk': patch
---

Fix fan-speed `fn` mapping for AC-V1-X (CodeNum=1117) devices (#179).

- Derive the send-side `fn` values from the device's reported `SupportedCaps.fanSpeeds` (positionally mapped to the canonical `[auto, low, medium, high, max]` order) instead of a hardcoded universal map. Devices that don't report `fanSpeeds` keep the previous behaviour.
- Recognise the CodeNum=1117 canonical receive values (`fn` 2/4/6 → low/medium/high) so the current fan speed is surfaced instead of coming back `undefined`.
- Add the `fanSpeeds` field to the `SupportedCaps` type so consumers no longer need to cast to access it.
