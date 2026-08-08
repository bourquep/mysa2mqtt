# mysa2mqtt

## 3.2.1

### Patch Changes

- [#258](https://github.com/bourquep/mysa2mqtt/pull/258) [`9a5973c`](https://github.com/bourquep/mysa2mqtt/commit/9a5973cc93a170e70a0a1d9dfd215e0007d73317) Thanks [@bourquep](https://github.com/bourquep)! - security: Update js-yaml to address CVE-2026-59870

- [#257](https://github.com/bourquep/mysa2mqtt/pull/257) [`7c6172f`](https://github.com/bourquep/mysa2mqtt/commit/7c6172f2aa46a5e5031b28bf9b31c4d10b30ab10) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore(deps-dev): Bump fast-uri from 3.1.4 to 3.1.5

- [#250](https://github.com/bourquep/mysa2mqtt/pull/250) [`a5ee5d6`](https://github.com/bourquep/mysa2mqtt/commit/a5ee5d651d28f2e15e280dfa46a3c76876f650c5) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore(deps): Bump brace-expansion from 5.0.8 to 5.0.9

- [#256](https://github.com/bourquep/mysa2mqtt/pull/256) [`ac71c31`](https://github.com/bourquep/mysa2mqtt/commit/ac71c318d62669cb81c7347239c0541f7c6d094a) Thanks [@vavallee](https://github.com/vavallee)! - Record a `--heartbeat-file` beat on successful REST state polls, not only on real-time messages. Writes stay throttled to one per 10 seconds, so a poll that follows a real-time message closely does not write again.

  A thermostat that is unplugged, powered off or off the network stops the real-time stream while mysa2mqtt itself stays healthy and keeps polling. The heartbeat file then went stale, so a liveness probe watching its mtime restarted the process every few minutes for as long as the thermostat stayed offline — restarts that could not fix anything, and that re-authenticated against the Mysa cloud each time.

  The heartbeat now means "mysa2mqtt can still reach the Mysa cloud", which is what a liveness probe can usefully act on. Detection of a wedged real-time connection is unaffected in practice: since REST polling was added, a wedged real-time path no longer freezes Home Assistant, and the poll fails alongside the real-time stream whenever the cause is on mysa2mqtt's side. Accounts that disable polling with `--poll-interval-seconds 0` keep the previous real-time-only behaviour.

- Updated dependencies [[`9a5973c`](https://github.com/bourquep/mysa2mqtt/commit/9a5973cc93a170e70a0a1d9dfd215e0007d73317), [`3fd6fad`](https://github.com/bourquep/mysa2mqtt/commit/3fd6fad25e18b0cf6d055c86c4d0a9314af59f0a), [`686266f`](https://github.com/bourquep/mysa2mqtt/commit/686266f41c58284325196843646def12476ee2d2), [`da0bdd4`](https://github.com/bourquep/mysa2mqtt/commit/da0bdd49e735037efc0177d45735ed32830b5bed), [`a5ee5d6`](https://github.com/bourquep/mysa2mqtt/commit/a5ee5d651d28f2e15e280dfa46a3c76876f650c5)]:
  - mqtt2ha@5.1.3
  - mysa-js-sdk@3.3.1

## 3.2.0

### Minor Changes

- [#246](https://github.com/bourquep/mysa2mqtt/pull/246) [`51b87ba`](https://github.com/bourquep/mysa2mqtt/commit/51b87badc7b875f6b43db98e8038718e1242d87c) Thanks [@mhlas7](https://github.com/mhlas7)! - Choose which sensor an in-floor heating thermostat (INF-V1-0) regulates against, from Home Assistant.

  These units have both an ambient air sensor and a floor probe. mysa2mqtt already reported which one the thermostat was tracking; now it can change it. In-floor thermostats gain a **Temperature source** dropdown with `Ambient` and `Floor` options, and picking one applies the setting to the device itself — the same change the Mysa app makes, so it also changes what the thermostat heats to. Changing it in the app updates the dropdown within a few seconds.

  The SDK gains `MysaApiClient.setTrackedSensor(deviceId, sensor)`, which sends the `tr` command field decoded from the Mysa app's own traffic, and rejects devices that have no floor probe with a new `UnsupportedTrackedSensorError`. The device's acknowledgement is surfaced as `StateChange.trackedSensor`, so a change is reflected in about a second rather than waiting for the next periodic status message.

### Patch Changes

- Updated dependencies [[`51b87ba`](https://github.com/bourquep/mysa2mqtt/commit/51b87badc7b875f6b43db98e8038718e1242d87c)]:
  - mysa-js-sdk@3.3.0

## 3.1.0

### Minor Changes

- [#245](https://github.com/bourquep/mysa2mqtt/pull/245) [`b75dcdb`](https://github.com/bourquep/mysa2mqtt/commit/b75dcdb186fb1be5d1cd26d56187d9782216ab03) Thanks [@mhlas7](https://github.com/mhlas7)! - Follow the temperature sensor an in-floor heating thermostat (INF-V1-0) is set to regulate against.

  These units have both an ambient air sensor and a floor probe, and the Mysa app lets the owner pick which one the thermostat tracks — but the climate entity always published the ambient reading. The device reports its selection as the `trackedSnsr` status field, which the SDK parsed but never surfaced; it is now exposed as `Status.trackedSensor`, and mysa2mqtt publishes the matching reading as the thermostat entity's current temperature. Picking the floor probe in the app is all that is needed.

  The **Current temperature** and **Floor temperature** sensors are unaffected: each keeps reporting its own probe. The selection only rides along on real-time status messages, so the ambient reading is used until the first one arrives.

### Patch Changes

- Updated dependencies [[`b75dcdb`](https://github.com/bourquep/mysa2mqtt/commit/b75dcdb186fb1be5d1cd26d56187d9782216ab03)]:
  - mysa-js-sdk@3.2.0

## 3.0.5

### Patch Changes

- [#234](https://github.com/bourquep/mysa2mqtt/pull/234) [`4152c3f`](https://github.com/bourquep/mysa2mqtt/commit/4152c3f51f0f2be0b3e2f372330d761bdf0db100) Thanks [@vavallee](https://github.com/vavallee)! - Stop forwarding fan-mode commands the thermostat's current mode does not support.

  Home Assistant's `fan_modes` list is fixed when the entity is discovered, so it has to advertise the union of every mode's fan speeds. On a device whose modes differ — an AC-V1-0 offers all four speeds in heat and cool but only `auto` in dry — that means the UI can offer a speed the current mode will not accept. Such a command used to be dropped silently; worse, the fan speed was validated against the union, so a speed valid in _some_ mode was forwarded, and the resulting command reapplied the current temperature and mode without changing the fan.

  Fan-mode commands are now validated against the current mode's own capabilities and a rejected one is logged with the mode and the speeds that mode does support, instead of disappearing.

- Updated dependencies [[`2e6746c`](https://github.com/bourquep/mysa2mqtt/commit/2e6746c48f2f28056564e0235ac5df60053392f4), [`a414f13`](https://github.com/bourquep/mysa2mqtt/commit/a414f13892cad96edeb8cf8d4a9ac0c188a6fd0e), [`4152c3f`](https://github.com/bourquep/mysa2mqtt/commit/4152c3f51f0f2be0b3e2f372330d761bdf0db100)]:
  - mysa-js-sdk@3.1.4

## 3.0.4

### Patch Changes

- [#232](https://github.com/bourquep/mysa2mqtt/pull/232) [`ec4842d`](https://github.com/bourquep/mysa2mqtt/commit/ec4842da2d7854f68b32a2cae684e486320577ff) Thanks [@bourquep](https://github.com/bourquep)! - Updates the brace-expansion package to address this security alert: https://github.com/bourquep/mysa2mqtt/security/dependabot/128

- Updated dependencies [[`ec4842d`](https://github.com/bourquep/mysa2mqtt/commit/ec4842da2d7854f68b32a2cae684e486320577ff)]:
  - mqtt2ha@5.1.2
  - mysa-js-sdk@3.1.3

## 3.0.3

### Patch Changes

- [#226](https://github.com/bourquep/mysa2mqtt/pull/226) [`a00f308`](https://github.com/bourquep/mysa2mqtt/commit/a00f3083c4d843c312a55e14c7903f0c4f6598cf) Thanks [@souvik101990](https://github.com/souvik101990)! - Fix fan-speed control for AC-V1-0 (CodeNum=1117) thermostats that don't enumerate `SupportedCaps.fanSpeeds`.

  These devices declare fan-speed support via `SupportedCaps.keys` (the FanSpeed ACState key, `4`) and report a live `FanSpeed` using canonical `fn` values (`1/2/4/6`), but their generic IR code set omits an explicit `SupportedCaps.fanSpeeds` list. As a result the fan was effectively uncontrollable:

  - `buildFanModes` (mysa2mqtt) treated "no `fanSpeeds`" as "no fan support" and advertised only `['auto']`, hiding low/medium/high in Home Assistant.
  - `buildFanSpeedSendMap` (mysa-js-sdk) fell back to the legacy `1/3/5/7` map, so a `high` command sent `fn: 7` — a value these canonical devices ignore — leaving the fan stuck at its current speed.

  Now:

  - `buildFanModes` advertises the canonical AC speeds (`auto/low/medium/high`) when a device omits `fanSpeeds` but declares fan support via `SupportedCaps.keys`.
  - `buildFanSpeedSendMap` uses the canonical `1/2/4/6` map for CodeNum=1117 devices without an explicit `fanSpeeds` list.

  Verified end-to-end against an AC-V1-0 unit: Home Assistant now advertises `auto/low/medium/high` and every fan command reaches the device (fan speed changes on the thermostat).

- [#230](https://github.com/bourquep/mysa2mqtt/pull/230) [`712d4c8`](https://github.com/bourquep/mysa2mqtt/commit/712d4c8b8d7a10056395afdffbacc68faef72e89) Thanks [@bourquep](https://github.com/bourquep)! - Fill in the Docker image metadata Docker Hub shows on the tag's Specifications tab: a full set of OCI labels (title, authors, vendor, url, documentation), a `copyright` label, `NODE_ENV=production`, and the source/revision/created labels and SBOM stamped by the release build.

- Updated dependencies [[`a00f308`](https://github.com/bourquep/mysa2mqtt/commit/a00f3083c4d843c312a55e14c7903f0c4f6598cf), [`50d71a3`](https://github.com/bourquep/mysa2mqtt/commit/50d71a3b4bb6810e10ea54e11500905f2157f590)]:
  - mysa-js-sdk@3.1.2

## 3.0.2

### Patch Changes

- [#121](https://github.com/bourquep/mysa2mqtt/pull/121) [`8fab111`](https://github.com/bourquep/mysa2mqtt/commit/8fab111568255ea6130123be8dd3fcf5cbb08b5b) Thanks [@souvik101990](https://github.com/souvik101990)! - Derive AC fan modes from `SupportedCaps` and preserve state on fan-mode changes (CodeNum=1117).

  AC-V1-X thermostats (Mysa for Mini-Split) report their supported fan speeds through `SupportedCaps.fanSpeeds` and use canonical `fn` values (`[1, 2, 4, 6]`) that differ from the legacy universal mapping. `mysa2mqtt` now:

  - recognizes the canonical `fn=2/4/6` values on the receive path so the current fan speed is reported instead of dropped;
  - derives the advertised `fan_modes` from the device's actual `SupportedCaps` instead of a hardcoded list (devices without fan-speed support advertise only `auto`), deduplicating modes that map from both legacy and canonical raw values;
  - rejects fan-mode commands the device doesn't support instead of silently reapplying the current state; and
  - preserves the current target temperature and climate mode when changing fan mode, and keeps the current fan mode when a state update omits the fan speed.

  `mysa-js-sdk` adds an optional per-mode `fanSpeeds` field to `SupportedCaps.modes` (the top-level `fanSpeeds` field was already present).

- [#129](https://github.com/bourquep/mysa2mqtt/pull/129) [`e81f182`](https://github.com/bourquep/mysa2mqtt/commit/e81f182cbeb84c8a5ca97f954746c7aba2f3a0e2) Thanks [@vavallee](https://github.com/vavallee)! - Retry startup on transient network errors instead of exiting immediately. DNS, TCP or TLS hiccups during the initial Cognito authentication (surfaced as generic `Network error` by `amazon-cognito-identity-js`) are now retried up to 10 times with exponential backoff before the process gives up. Configuration and programming errors still exit immediately.

- [#217](https://github.com/bourquep/mysa2mqtt/pull/217) [`0da4a1d`](https://github.com/bourquep/mysa2mqtt/commit/0da4a1d4e95dddf9638ec00747895008a10f7ba8) Thanks [@bourquep](https://github.com/bourquep)! - Updated dependencies to latest versions

- Updated dependencies [[`8fab111`](https://github.com/bourquep/mysa2mqtt/commit/8fab111568255ea6130123be8dd3fcf5cbb08b5b), [`169272d`](https://github.com/bourquep/mysa2mqtt/commit/169272d366dc76cb3d07831d752b83a7f9f57733), [`0da4a1d`](https://github.com/bourquep/mysa2mqtt/commit/0da4a1d4e95dddf9638ec00747895008a10f7ba8), [`f0dc8c1`](https://github.com/bourquep/mysa2mqtt/commit/f0dc8c1c812e469cde891b513a812e717d584aff), [`02ad499`](https://github.com/bourquep/mysa2mqtt/commit/02ad49990fd3f3b79f8c7d302fb461d29b5fb542), [`b89b238`](https://github.com/bourquep/mysa2mqtt/commit/b89b238741f94cd9557c2795929f0a7c7a60d341), [`6bd3f92`](https://github.com/bourquep/mysa2mqtt/commit/6bd3f920dc85697c2d9665b31e25b36767884ecd)]:
  - mysa-js-sdk@3.1.1
  - mqtt2ha@5.1.1

## 3.0.1

### Patch Changes

- Updated dependencies [[`42b7008`](https://github.com/bourquep/mysa2mqtt/commit/42b7008a4b5f71a27f6b041a9fd0811a7efc0f4a), [`d578966`](https://github.com/bourquep/mysa2mqtt/commit/d5789661c7f134e183102291cdce09fc4364d8eb)]:
  - mqtt2ha@5.1.0

## 3.0.0

### Major Changes

- [#206](https://github.com/bourquep/mysa2mqtt/pull/206) [`49fb518`](https://github.com/bourquep/mysa2mqtt/commit/49fb5186e383fb112240a87c6bdeb0fd23712a63) Thanks [@bourquep](https://github.com/bourquep)! - Fix colliding MQTT discovery topics produced by `cleanString` ([#153](https://github.com/bourquep/mysa2mqtt/issues/153)).

  Previously every unsupported character was replaced with a single hyphen, so distinct inputs collided (`cleanString('a/b') === cleanString('a b')`). Two entities whose names differed only in punctuation received the **same** discovery topic and silently overwrote each other in Home Assistant.

  `cleanString` now uses a reversible, collision-free percent-style encoding: alphanumerics and underscores pass through unchanged, while every other character (including a literal hyphen) is escaped as `-XX`, where `XX` is the uppercase hex value of each UTF-8 byte. A hyphen is used as the escape sigil instead of `%` because Home Assistant only accepts `[A-Za-z0-9_-]` in discovery `node_id`/`object_id` segments.

  **Breaking change / migration:** any topic segment derived from a device or entity name that contained characters outside `[A-Za-z0-9_]` will now have a different name (e.g. `Living-Room` becomes `Living-20Room`). Home Assistant will create new entities under the new topics. After upgrading, delete the now-orphaned MQTT devices/entities from Home Assistant (Settings → Devices & services → MQTT) so the stale duplicates are removed.

### Minor Changes

- [#211](https://github.com/bourquep/mysa2mqtt/pull/211) [`5dc3270`](https://github.com/bourquep/mysa2mqtt/commit/5dc32709beee8fa7caf487f422c0ed97ebc7c4a2) Thanks [@bourquep](https://github.com/bourquep)! - Add in-floor heating thermostat (INF-V1-0) support ([#94](https://github.com/bourquep/mysa2mqtt/issues/94)).

  - Publish a **Floor temperature** sensor for in-floor thermostats, reflecting the floor-probe reading. The ambient air temperature remains the climate's current temperature.
  - Estimate power draw for in-floor thermostats from the `--heater-watts` rating (they report a heating-relay state rather than a current draw), gating the **Current power** sensor on that configuration just like V2 thermostats.

- [#208](https://github.com/bourquep/mysa2mqtt/pull/208) [`ebde3d2`](https://github.com/bourquep/mysa2mqtt/commit/ebde3d2319a906f7a933096c655de537e1faf0fe) Thanks [@bourquep](https://github.com/bourquep)! - Poll device state over REST periodically so Home Assistant stays current even when the real-time AWS IoT connection cannot be established (e.g. all-Lite fleets, whose WebSocket handshake fails with `AWS_ERROR_HTTP_WEBSOCKET_UPGRADE_FAILURE`) or is chronically unstable (e.g. INF-V1). Previously these fleets only ever received the single state snapshot taken at startup, then froze.

  A single account-wide poll refreshes every thermostat, so the request cost does not grow with fleet size. Configure the cadence with `--poll-interval-seconds` (`M2M_POLL_INTERVAL_SECONDS`), which defaults to 60 seconds; set it to 0 to disable, or to at least 30.

- [#212](https://github.com/bourquep/mysa2mqtt/pull/212) [`a1000a7`](https://github.com/bourquep/mysa2mqtt/commit/a1000a7475c4487931edddab678ace6558a1d0e7) Thanks [@bourquep](https://github.com/bourquep)! - Add a `mysa2mqtt-capture` tool (and the underlying `MysaApiClient.startRawTopicCapture()` SDK method) to record the raw AWS IoT Device Shadow traffic of unsupported thermostats, most notably the central-HVAC ST-V1.

  Unlike the real-time path, `startRawTopicCapture()` subscribes to arbitrary MQTT topic filters and relays every message verbatim (full topic + decoded payload) with no parsing, re-subscribing across reconnects. The `mysa2mqtt-capture` command uses it to dump a device's REST metadata and passively record every shadow message to a file, providing the raw material needed to implement support for a new device family. Run `npm run capture -w mysa2mqtt -- --help` for usage.

### Patch Changes

- Updated dependencies [[`b5bf8f9`](https://github.com/bourquep/mysa2mqtt/commit/b5bf8f922c90a2342466e9ea1ba7e398ff0cd5d6), [`3229264`](https://github.com/bourquep/mysa2mqtt/commit/32292646a27ea8d58a43864bb9255553114df4b7), [`49fb518`](https://github.com/bourquep/mysa2mqtt/commit/49fb5186e383fb112240a87c6bdeb0fd23712a63), [`5dc3270`](https://github.com/bourquep/mysa2mqtt/commit/5dc32709beee8fa7caf487f422c0ed97ebc7c4a2), [`49d3017`](https://github.com/bourquep/mysa2mqtt/commit/49d3017fd301c1b79560d1a6403927a7c15de3be), [`a1000a7`](https://github.com/bourquep/mysa2mqtt/commit/a1000a7475c4487931edddab678ace6558a1d0e7)]:
  - mysa-js-sdk@3.1.0
  - mqtt2ha@5.0.0

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
