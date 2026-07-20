---
'mysa2mqtt': patch
---

PinoLogger no longer passes the first metadata value twice (once as pino's merge object and again as an interpolation argument), and falsy-but-valid values like 0 or an empty string are now forwarded instead of being routed through the null branch.
