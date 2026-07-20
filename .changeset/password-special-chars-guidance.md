---
'mysa2mqtt': patch
---

A rejected Mysa login now reports that special characters in the password are frequently consumed by the shell, Docker Compose or a `.env` file before they reach mysa2mqtt, instead of surfacing a bare `Incorrect username or password.` stack trace. Debug logging also reports the length of the password that was actually received, so a mangled value can be spotted without logging the secret.
