---
'mysa2mqtt': patch
---

Apply state changes that arrive without an operating mode instead of silently dropping them. Home Assistant no longer
shows a stale target temperature (or fan speed) when Mysa pushes a modeless update.
