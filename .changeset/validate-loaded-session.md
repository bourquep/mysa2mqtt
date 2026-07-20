---
'mysa2mqtt': patch
---

loadSession now validates the parsed session file against the expected MysaSession shape (string username and tokens) before returning it. A corrupted or truncated session file falls back to the normal no-valid-session path instead of surfacing later as a confusing downstream failure.
