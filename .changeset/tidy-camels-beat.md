---
'mysa2mqtt': minor
---

Added `--heartbeat-file` / `M2M_HEARTBEAT_FILE`: when set, mysa2mqtt touches the given file on every message received
from the Mysa cloud (throttled to one write per 10 seconds). External supervisors can watch the file's mtime to detect a
wedged cloud connection and restart the process — for example a Kubernetes exec liveness probe checking that the file is
fresher than 15 minutes.
