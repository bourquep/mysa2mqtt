---
'mysa2mqtt': major
---

mysa2mqtt no longer persists a session file, and re-authenticates automatically when the Mysa session expires instead of crashing with "Refresh Token has expired". The `-s, --mysa-session-file` option and its `M2M_MYSA_SESSION_FILE` environment variable are removed: drop any `session.json` volume mount from your `docker run` command or compose file, and delete the leftover file.
