---
'mysa-js-sdk': patch
---

Payload parse failures no longer write to console.error, which bypassed the configurable SDK logger and could leak payload contents. The error is rethrown with the original failure attached as cause and logged by the message handler through the SDK logger.
