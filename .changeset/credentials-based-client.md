---
'mysa-js-sdk': major
---

The client now takes Mysa account credentials instead of a session object, and re-authenticates on its own when its refresh token expires or is revoked, so long-running processes no longer die after about a month. `new MysaApiClient(session, options)` becomes `new MysaApiClient({ username, password }, options)`, `login()` no longer takes arguments and is optional (the client authenticates on demand), and the `MysaSession` type, the `session` and `isAuthenticated` properties, and the `sessionChanged` event are gone — there is no longer any session state to persist.
