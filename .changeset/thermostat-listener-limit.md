---
'mysa2mqtt': patch
---

Stop logging a `MaxListenersExceededWarning` when the account has more than 10 Mysa devices. Each thermostat adds its own
status listener to the shared client, which is expected and not a leak, so the listener limit now scales with the number
of devices.
