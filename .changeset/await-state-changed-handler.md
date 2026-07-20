---
'mqtt2ha': patch
---

setState now awaits the state-changed handler, so callers that await setState observe handler completion and failures instead of racing it. setStateSync keeps its synchronous shape but attaches error logging to the handler promise, so a rejection is surfaced through the logger instead of escaping as an unhandled rejection that can terminate the process.
