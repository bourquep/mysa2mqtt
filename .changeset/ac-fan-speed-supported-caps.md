---
'mysa2mqtt': patch
'mysa-js-sdk': patch
---

Derive AC fan modes from `SupportedCaps` and preserve state on fan-mode changes (CodeNum=1117).

AC-V1-X thermostats (Mysa for Mini-Split) report their supported fan speeds through `SupportedCaps.fanSpeeds` and use canonical `fn` values (`[1, 2, 4, 6]`) that differ from the legacy universal mapping. `mysa2mqtt` now:

- recognizes the canonical `fn=2/4/6` values on the receive path so the current fan speed is reported instead of dropped;
- derives the advertised `fan_modes` from the device's actual `SupportedCaps` instead of a hardcoded list (devices without fan-speed support advertise only `auto`), deduplicating modes that map from both legacy and canonical raw values;
- rejects fan-mode commands the device doesn't support instead of silently reapplying the current state; and
- preserves the current target temperature and climate mode when changing fan mode, and keeps the current fan mode when a state update omits the fan speed.

`mysa-js-sdk` adds an optional per-mode `fanSpeeds` field to `SupportedCaps.modes` (the top-level `fanSpeeds` field was already present).
