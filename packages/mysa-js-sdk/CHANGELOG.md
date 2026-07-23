# mysa-js-sdk

## 3.1.1

### Patch Changes

- [#121](https://github.com/bourquep/mysa2mqtt/pull/121) [`8fab111`](https://github.com/bourquep/mysa2mqtt/commit/8fab111568255ea6130123be8dd3fcf5cbb08b5b) Thanks [@souvik101990](https://github.com/souvik101990)! - Derive AC fan modes from `SupportedCaps` and preserve state on fan-mode changes (CodeNum=1117).

  AC-V1-X thermostats (Mysa for Mini-Split) report their supported fan speeds through `SupportedCaps.fanSpeeds` and use canonical `fn` values (`[1, 2, 4, 6]`) that differ from the legacy universal mapping. `mysa2mqtt` now:

  - recognizes the canonical `fn=2/4/6` values on the receive path so the current fan speed is reported instead of dropped;
  - derives the advertised `fan_modes` from the device's actual `SupportedCaps` instead of a hardcoded list (devices without fan-speed support advertise only `auto`), deduplicating modes that map from both legacy and canonical raw values;
  - rejects fan-mode commands the device doesn't support instead of silently reapplying the current state; and
  - preserves the current target temperature and climate mode when changing fan mode, and keeps the current fan mode when a state update omits the fan speed.

  `mysa-js-sdk` adds an optional per-mode `fanSpeeds` field to `SupportedCaps.modes` (the top-level `fanSpeeds` field was already present).

- [#217](https://github.com/bourquep/mysa2mqtt/pull/217) [`0da4a1d`](https://github.com/bourquep/mysa2mqtt/commit/0da4a1d4e95dddf9638ec00747895008a10f7ba8) Thanks [@bourquep](https://github.com/bourquep)! - Updated dependencies to latest versions

## 3.1.0

### Minor Changes

- [#211](https://github.com/bourquep/mysa2mqtt/pull/211) [`5dc3270`](https://github.com/bourquep/mysa2mqtt/commit/5dc32709beee8fa7caf487f422c0ed97ebc7c4a2) Thanks [@bourquep](https://github.com/bourquep)! - Support Mysa in-floor heating thermostats (INF-V1-0) ([#94](https://github.com/bourquep/mysa2mqtt/issues/94)).

  - Parse the in-floor-specific status fields — floor-probe temperature (`flrSnsrTemp`), binary heating-relay state (`heatStat`), tracked sensor (`trackedSnsr`) and line voltage (`lineVtg`) — which share the V2 status message type (`msg: 40`). `heatStat` maps onto the emitted `dutyCycle`, and the floor-probe reading is surfaced as a new `Status.floorTemperature`.
  - Send the correct control command `type` (3) for in-floor thermostats so setpoint and mode changes take effect instead of being silently ignored.

- [#212](https://github.com/bourquep/mysa2mqtt/pull/212) [`a1000a7`](https://github.com/bourquep/mysa2mqtt/commit/a1000a7475c4487931edddab678ace6558a1d0e7) Thanks [@bourquep](https://github.com/bourquep)! - Add a `mysa2mqtt-capture` tool (and the underlying `MysaApiClient.startRawTopicCapture()` SDK method) to record the raw AWS IoT Device Shadow traffic of unsupported thermostats, most notably the central-HVAC ST-V1.

  Unlike the real-time path, `startRawTopicCapture()` subscribes to arbitrary MQTT topic filters and relays every message verbatim (full topic + decoded payload) with no parsing, re-subscribing across reconnects. The `mysa2mqtt-capture` command uses it to dump a device's REST metadata and passively record every shadow message to a file, providing the raw material needed to implement support for a new device family. Run `npm run capture -w mysa2mqtt -- --help` for usage.

### Patch Changes

- [#205](https://github.com/bourquep/mysa2mqtt/pull/205) [`b5bf8f9`](https://github.com/bourquep/mysa2mqtt/commit/b5bf8f922c90a2342466e9ea1ba7e398ff0cd5d6) Thanks [@bourquep](https://github.com/bourquep)! - Fix fan-speed `fn` mapping for AC-V1-X (CodeNum=1117) devices ([#179](https://github.com/bourquep/mysa2mqtt/issues/179)).

  - Derive the send-side `fn` values from the device's reported `SupportedCaps.fanSpeeds` (positionally mapped to the canonical `[auto, low, medium, high, max]` order) instead of a hardcoded universal map. Devices that don't report `fanSpeeds` keep the previous behaviour.
  - Recognise the CodeNum=1117 canonical receive values (`fn` 2/4/6 → low/medium/high) so the current fan speed is surfaced instead of coming back `undefined`.
  - Add the `fanSpeeds` field to the `SupportedCaps` type so consumers no longer need to cast to access it.
  - Throw a new `UnsupportedFanSpeedError` when a requested fan speed is not supported by the target device (e.g. `max` on a device that only exposes auto/low/medium/high), instead of silently publishing a no-op command.

- [#202](https://github.com/bourquep/mysa2mqtt/pull/202) [`49d3017`](https://github.com/bourquep/mysa2mqtt/commit/49d3017fd301c1b79560d1a6403927a7c15de3be) Thanks [@bourquep](https://github.com/bourquep)! - Harden the MQTT connection against `AWS_ERROR_MQTT_UNEXPECTED_HANGUP` interrupt storms ([#178](https://github.com/bourquep/mysa2mqtt/issues/178)).

  - Switch to clean MQTT sessions so the broker no longer redelivers a backlog of queued QoS1 messages on reconnect (the source of the ~1000x message bursts and exponential Home Assistant database growth) and so forced resets no longer leave orphaned broker sessions.
  - Make the forced connection reset repeatable with exponential backoff instead of one-shot, so a persistent storm keeps recovering (fresh client id + fresh credentials) rather than giving up.
  - Tag each connection with a generation and ignore events from discarded connections, and ensure the reset never rejects — preventing the in-flight publish crash (`AWS_ERROR_MQTT_CONNECTION_DESTROYED`) that terminated the process.
  - Add interrupt dwell-time and session diagnostics to help pin down the server-side hangup trigger.

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
