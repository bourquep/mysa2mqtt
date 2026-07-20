# mysa2mqtt

## 2.0.0

### Major Changes

- [#199](https://github.com/bourquep/mysa2mqtt/pull/199) [`b384d79`](https://github.com/bourquep/mysa2mqtt/commit/b384d7950d757bc85af7580eaa26435190b47364) Thanks [@bourquep](https://github.com/bourquep)! - mysa2mqtt no longer persists a session file, and re-authenticates automatically when the Mysa session expires instead of crashing with "Refresh Token has expired". The `-s, --mysa-session-file` option and its `M2M_MYSA_SESSION_FILE` environment variable are removed: drop any `session.json` volume mount from your `docker run` command or compose file, and delete the leftover file.

### Minor Changes

- [#200](https://github.com/bourquep/mysa2mqtt/pull/200) [`61dc2a2`](https://github.com/bourquep/mysa2mqtt/commit/61dc2a2b395397e9e5245098bfd31b49b501fd7d) Thanks [@bourquep](https://github.com/bourquep)! - V2 thermostats can now report power. These devices have no current sensor and only report the duty cycle of their heating relay, which is why their **Current power** sensor has always been unavailable. Set the new `--heater-watts` option (`M2M_HEATER_WATTS`) to the rated wattage of the heaters each thermostat controls — for example `M2M_HEATER_WATTS="Kitchen=1500,<device-id>=750"`, matching devices by name or id — and power is estimated as `duty cycle × rated wattage`. V1 thermostats measure their own current and continue to work with no configuration.

  The power sensor is now only created for devices that can actually report a value. If you have AC devices, or V2 thermostats for which you have not configured a wattage, their **Current power** entity is removed from Home Assistant on startup; it only ever showed as unavailable.

  `mqtt2ha` gains a `Discoverable.removeConfig()` method, which clears an entity's retained discovery topic so Home Assistant drops the entity. This is what makes the removal above take effect: because `writeConfig()` retains its payload, an entity published by an earlier run persists until its topic is explicitly cleared.

### Patch Changes

- [#201](https://github.com/bourquep/mysa2mqtt/pull/201) [`10ee91c`](https://github.com/bourquep/mysa2mqtt/commit/10ee91c1981b77ef1e9f76abd3d24ba6d9a19d77) Thanks [@bourquep](https://github.com/bourquep)! - A Mysa login rejected for a bad password now reports that a `$` in it is expanded by shells and by Docker Compose (in both `environment:` entries and default-format `env_file:` files, where it must be written `$$`, but not in an `env_file:` declared with `format: raw`), and that an unquoted `#` truncates a `.env` value, instead of surfacing a bare `Incorrect username or password.` stack trace. An unrecognized account gets username-specific guidance instead, since none of the password escaping rules apply to it. Transport and Cognito service failures keep propagating without that guidance, since `UnauthenticatedError` now carries the underlying failure as its `cause`. Debug logging also reports the length of the password that was actually received -- never the password or the account it belongs to -- so a mangled value can be spotted at a glance.

- [#192](https://github.com/bourquep/mysa2mqtt/pull/192) [`4917fd0`](https://github.com/bourquep/mysa2mqtt/commit/4917fd0166244c168b95abf7d87ad09815e02233) Thanks [@vavallee](https://github.com/vavallee)! - PinoLogger no longer passes the first metadata value twice (once as pino's merge object and again as an interpolation argument), and falsy-but-valid values like 0 or an empty string are now forwarded instead of being routed through the null branch.

- Updated dependencies [[`b384d79`](https://github.com/bourquep/mysa2mqtt/commit/b384d7950d757bc85af7580eaa26435190b47364), [`4911b04`](https://github.com/bourquep/mysa2mqtt/commit/4911b04c15349e6d508717bf0880346fa1ed9b80), [`10ee91c`](https://github.com/bourquep/mysa2mqtt/commit/10ee91c1981b77ef1e9f76abd3d24ba6d9a19d77), [`7169263`](https://github.com/bourquep/mysa2mqtt/commit/7169263fcb4b2aeb51c7eae4c112972c3e2fdb08), [`527ef25`](https://github.com/bourquep/mysa2mqtt/commit/527ef25886aad766a2fd71fc92002d8de126b364), [`61dc2a2`](https://github.com/bourquep/mysa2mqtt/commit/61dc2a2b395397e9e5245098bfd31b49b501fd7d)]:
  - mysa-js-sdk@3.0.0
  - mqtt2ha@4.2.0

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
