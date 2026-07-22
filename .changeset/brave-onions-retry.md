---
'mysa2mqtt': patch
---

Retry startup on transient network errors instead of exiting immediately. DNS, TCP or TLS hiccups during the initial
Cognito authentication (surfaced as generic `Network error` by `amazon-cognito-identity-js`) are now retried up to 10
times with exponential backoff before the process gives up. Configuration and programming errors still exit immediately.
