---
'mqtt2ha': patch
---

Errors thrown while subscribing to command topics or handling a received command are now caught and logged instead of escaping as unhandled promise rejections, which could terminate the process under Node's default rejection policy.
