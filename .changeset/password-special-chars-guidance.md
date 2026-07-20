---
'mysa2mqtt': patch
'mysa-js-sdk': patch
---

A Mysa login rejected for bad credentials now reports that a `$` in the password is expanded by shells and by Docker Compose (in both `environment:` entries and `env_file:` files, where it must be written `$$`), and that an unquoted `#` truncates a `.env` value, instead of surfacing a bare `Incorrect username or password.` stack trace. Transport and Cognito service failures keep propagating without that guidance, since `UnauthenticatedError` now carries the underlying failure as its `cause`. Debug logging also reports the length of the password that was actually received -- never the password or the account it belongs to -- so a mangled value can be spotted at a glance.
