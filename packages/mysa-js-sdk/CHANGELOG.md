# mysa-js-sdk

## 3.0.0

### Major Changes

- [#199](https://github.com/bourquep/mysa2mqtt/pull/199) [`b384d79`](https://github.com/bourquep/mysa2mqtt/commit/b384d7950d757bc85af7580eaa26435190b47364) Thanks [@bourquep](https://github.com/bourquep)! - The client now takes Mysa account credentials instead of a session object, and re-authenticates on its own when its refresh token expires or is revoked, so long-running processes no longer die after about a month. `new MysaApiClient(session, options)` becomes `new MysaApiClient({ username, password }, options)`, `login()` no longer takes arguments and is optional (the client authenticates on demand), and the `MysaSession` type, the `session` and `isAuthenticated` properties, and the `sessionChanged` event are gone — there is no longer any session state to persist.

### Patch Changes

- [#201](https://github.com/bourquep/mysa2mqtt/pull/201) [`10ee91c`](https://github.com/bourquep/mysa2mqtt/commit/10ee91c1981b77ef1e9f76abd3d24ba6d9a19d77) Thanks [@bourquep](https://github.com/bourquep)! - A Mysa login rejected for a bad password now reports that a `$` in it is expanded by shells and by Docker Compose (in both `environment:` entries and default-format `env_file:` files, where it must be written `$$`, but not in an `env_file:` declared with `format: raw`), and that an unquoted `#` truncates a `.env` value, instead of surfacing a bare `Incorrect username or password.` stack trace. An unrecognized account gets username-specific guidance instead, since none of the password escaping rules apply to it. Transport and Cognito service failures keep propagating without that guidance, since `UnauthenticatedError` now carries the underlying failure as its `cause`. Debug logging also reports the length of the password that was actually received -- never the password or the account it belongs to -- so a mangled value can be spotted at a glance.

- [#190](https://github.com/bourquep/mysa2mqtt/pull/190) [`7169263`](https://github.com/bourquep/mysa2mqtt/commit/7169263fcb4b2aeb51c7eae4c112972c3e2fdb08) Thanks [@vavallee](https://github.com/vavallee)! - Payload parse failures no longer write to console.error, which bypassed the configurable SDK logger and could leak payload contents. The error is rethrown with the original failure attached as cause and logged by the message handler through the SDK logger.

- [#191](https://github.com/bourquep/mysa2mqtt/pull/191) [`527ef25`](https://github.com/bourquep/mysa2mqtt/commit/527ef25886aad766a2fd71fc92002d8de126b364) Thanks [@vavallee](https://github.com/vavallee)! - setDeviceState now throws a descriptive UnknownDeviceError when the device id does not match any device on the account, instead of failing with a raw TypeError on an undefined dereference.

- [#200](https://github.com/bourquep/mysa2mqtt/pull/200) [`61dc2a2`](https://github.com/bourquep/mysa2mqtt/commit/61dc2a2b395397e9e5245098bfd31b49b501fd7d) Thanks [@bourquep](https://github.com/bourquep)! - V2 thermostats can now report power. These devices have no current sensor and only report the duty cycle of their heating relay, which is why their **Current power** sensor has always been unavailable. Set the new `--heater-watts` option (`M2M_HEATER_WATTS`) to the rated wattage of the heaters each thermostat controls — for example `M2M_HEATER_WATTS="Kitchen=1500,<device-id>=750"`, matching devices by name or id — and power is estimated as `duty cycle × rated wattage`. V1 thermostats measure their own current and continue to work with no configuration.

  The power sensor is now only created for devices that can actually report a value. If you have AC devices, or V2 thermostats for which you have not configured a wattage, their **Current power** entity is removed from Home Assistant on startup; it only ever showed as unavailable.

  `mqtt2ha` gains a `Discoverable.removeConfig()` method, which clears an entity's retained discovery topic so Home Assistant drops the entity. This is what makes the removal above take effect: because `writeConfig()` retains its payload, an entity published by an earlier run persists until its topic is explicitly cleared.

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
