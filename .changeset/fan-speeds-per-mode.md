---
'mysa-js-sdk': patch
---

Send fan-speed commands the device actually accepts in its current mode.

An AC thermostat can accept different fan speeds per mode: an AC-V1-0 driving a mini-split offers auto/low/medium/high
in heat and cool, but only `auto` in auto and dry, and only low/medium/high in fan-only. The send map was built from the
device-wide `SupportedCaps.fanSpeeds` alone, so a command was mapped identically in every mode. `setDeviceState` now
prefers the target mode's own `SupportedCaps.modes[md].fanSpeeds` list, and rejects a speed that mode does not support
with `UnsupportedFanSpeedError` instead of publishing an `fn` value the unit ignores.

Per-mode lists are mapped by value rather than by position. A mode that omits a speed — fan-only reporting `3, 5, 7`,
with no `auto` — would otherwise have every speed shifted by one when zipped against the canonical order, so asking for
`auto` would have set the fan to low. Devices that publish only a device-wide list keep the positional reading, which is
how that list is defined.

Devices with per-mode lists but no device-wide list previously fell through to the universal legacy mapping. They now
use their own reported values.

Also fixes the `CodeNum` comparison that selects the canonical `1/2/4/6` fan-speed mapping for AC-V1-X thermostats. The
REST API reports `CodeNum` as a string (e.g. `"2009"`), so a strict `===` against the numeric literal `1117` never
matched and those devices silently fell back to the legacy `1/3/5/7` values, which they ignore. The comparison is now
numeric, and `DeviceBase.CodeNum` is typed `number | string` to match what the API returns.
