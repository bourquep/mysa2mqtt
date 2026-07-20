# mysa-js-sdk

## 2.1.2

### Patch Changes

- [#182](https://github.com/bourquep/mysa2mqtt/pull/182) [`21991c0`](https://github.com/bourquep/mysa2mqtt/commit/21991c0731cb888dc69d15b3b0dc164aee4992f7) Thanks [@vavallee](https://github.com/vavallee)! - Fixed `startRealtimeUpdates` hanging forever when the Mysa broker silently ignores a `START_PUBLISHING_DEVICE_STATUS` publish. QoS1 publishes now time out after 30 seconds if no acknowledgement arrives (observed in production since July 2026: the broker drops these publishes without a PUBACK, and the client's 60s protocol operation timeout never fires). A failed status-publishing request no longer aborts realtime startup and a failed keep-alive no longer surfaces as an unhandled rejection — both are logged as warnings, since the device's autonomous periodic status reports (message type 30) keep flowing over the subscription either way.

## 2.1.1

### Patch Changes

- [#149](https://github.com/bourquep/mysa2mqtt/pull/149) [`89e2950`](https://github.com/bourquep/mysa2mqtt/commit/89e2950c4874db14ea9b682380c63984aaf7a9f4) Thanks [@bourquep](https://github.com/bourquep)! - Moved development into the [mysa2mqtt monorepo](https://github.com/bourquep/mysa2mqtt).

  There are no functional changes in this release. The package's repository and homepage links now point at the monorepo, and issues for all three packages are tracked at https://github.com/bourquep/mysa2mqtt/issues.

## Releases prior to 2.1.0

This package previously lived in its own repository and used semantic-release, which published its release notes to GitHub Releases rather than to a changelog file.

See the [release history of the archived repository](https://github.com/bourquep/mysa-js-sdk/releases) for notes on versions up to and including 2.1.0.
