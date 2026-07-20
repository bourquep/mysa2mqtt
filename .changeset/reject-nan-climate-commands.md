---
'mqtt2ha': patch
---

Numeric climate command payloads (target temperature, humidity, high/low bounds) are now validated: a payload that does not parse to a finite number is logged and ignored instead of storing NaN in state and republishing it.
