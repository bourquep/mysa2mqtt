# mysa2mqtt

## 1.3.0

### Minor Changes

- [#183](https://github.com/bourquep/mysa2mqtt/pull/183) [`604a3b7`](https://github.com/bourquep/mysa2mqtt/commit/604a3b7df903d09f672b5fe30bacd663d1e9fe1f) Thanks [@vavallee](https://github.com/vavallee)! - Added `--heartbeat-file` / `M2M_HEARTBEAT_FILE`: when set, mysa2mqtt touches the given file on every message received from the Mysa cloud (throttled to one write per 10 seconds). External supervisors can watch the file's mtime to detect a wedged cloud connection and restart the process — for example a Kubernetes exec liveness probe checking that the file is fresher than 15 minutes.

### Patch Changes

- [#186](https://github.com/bourquep/mysa2mqtt/pull/186) [`ed84637`](https://github.com/bourquep/mysa2mqtt/commit/ed846373e866625f5c74ca8e98d110954595515b) Thanks [@vavallee](https://github.com/vavallee)! - Apply state changes that arrive without an operating mode instead of silently dropping them. Home Assistant no longer shows a stale target temperature (or fan speed) when Mysa pushes a modeless update.

- Updated dependencies [[`7affd92`](https://github.com/bourquep/mysa2mqtt/commit/7affd92614ee6f8ac160afacae7c7ea1c3a2a9e9), [`21991c0`](https://github.com/bourquep/mysa2mqtt/commit/21991c0731cb888dc69d15b3b0dc164aee4992f7)]:
  - mqtt2ha@4.1.5
  - mysa-js-sdk@2.1.2

## 1.2.4

### Patch Changes

- [#149](https://github.com/bourquep/mysa2mqtt/pull/149) [`89e2950`](https://github.com/bourquep/mysa2mqtt/commit/89e2950c4874db14ea9b682380c63984aaf7a9f4) Thanks [@bourquep](https://github.com/bourquep)! - Moved development into the [mysa2mqtt monorepo](https://github.com/bourquep/mysa2mqtt).

  There are no functional changes in this release. The package's repository and homepage links now point at the monorepo, and issues for all three packages are tracked at https://github.com/bourquep/mysa2mqtt/issues.

- Updated dependencies [[`89e2950`](https://github.com/bourquep/mysa2mqtt/commit/89e2950c4874db14ea9b682380c63984aaf7a9f4)]:
  - mysa-js-sdk@2.1.1
  - mqtt2ha@4.1.4

## Releases prior to 1.2.3

This package previously lived in a standalone repository and used semantic-release, which published its release notes to GitHub Releases rather than to a changelog file.

See the [release history](https://github.com/bourquep/mysa2mqtt/releases) for notes on versions up to and including 1.2.3. Those releases are tagged `v1.2.3`; releases from the monorepo onwards are tagged `mysa2mqtt@<version>`.
