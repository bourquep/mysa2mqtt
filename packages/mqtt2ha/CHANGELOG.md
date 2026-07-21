# mqtt2ha

## 5.1.0

### Minor Changes

- [#215](https://github.com/bourquep/mysa2mqtt/pull/215) [`d578966`](https://github.com/bourquep/mysa2mqtt/commit/d5789661c7f134e183102291cdce09fc4364d8eb) Thanks [@bourquep](https://github.com/bourquep)! - Implement the remaining Home Assistant MQTT components ([#180](https://github.com/bourquep/mysa2mqtt/issues/180)).

  Adds `alarm_control_panel`, `camera`, `cover`, `event`, `fan`, `humidifier`, `image`, `lawn_mower`, `light`, `lock`, `number`, `scene`, `select`, `siren`, `text`, `update`, `vacuum`, `valve` and `water_heater`, completing the set of discoverable entity types. Each follows the existing component conventions: state-only entities extend `Discoverable`, while entities that accept commands extend `Subscriber`, exposing typed configuration interfaces and convenience accessors that publish state and reflect incoming commands.

  The `number` component is exported as `NumberEntity` to avoid shadowing the built-in `Number` global.

### Patch Changes

- [#213](https://github.com/bourquep/mysa2mqtt/pull/213) [`42b7008`](https://github.com/bourquep/mysa2mqtt/commit/42b7008a4b5f71a27f6b041a9fd0811a7efc0f4a) Thanks [@bourquep](https://github.com/bourquep)! - Stop `JSON.parse`-ing command payloads, which changed their runtime type ([#163](https://github.com/bourquep/mysa2mqtt/issues/163)).

  `Subscriber` used to `JSON.parse` each incoming command payload and fall back to the raw string, then cast the result to the command-map type. Because Home Assistant MQTT command payloads are strings, this meant `'123'` reached handlers as a `number` and `'true'` as a `boolean`, while `'ON'` stayed a `string` — the runtime type depended on the payload's content, contradicting the declared type. The raw string is now passed through unchanged, and `CommandCallback`/`Subscriber` constrain command-map values to `string`. Components that carry a JSON-encoded payload on a command topic are responsible for decoding it in their own handler.

## 5.0.0

### Major Changes

- [#206](https://github.com/bourquep/mysa2mqtt/pull/206) [`49fb518`](https://github.com/bourquep/mysa2mqtt/commit/49fb5186e383fb112240a87c6bdeb0fd23712a63) Thanks [@bourquep](https://github.com/bourquep)! - Fix colliding MQTT discovery topics produced by `cleanString` ([#153](https://github.com/bourquep/mysa2mqtt/issues/153)).

  Previously every unsupported character was replaced with a single hyphen, so distinct inputs collided (`cleanString('a/b') === cleanString('a b')`). Two entities whose names differed only in punctuation received the **same** discovery topic and silently overwrote each other in Home Assistant.

  `cleanString` now uses a reversible, collision-free percent-style encoding: alphanumerics and underscores pass through unchanged, while every other character (including a literal hyphen) is escaped as `-XX`, where `XX` is the uppercase hex value of each UTF-8 byte. A hyphen is used as the escape sigil instead of `%` because Home Assistant only accepts `[A-Za-z0-9_-]` in discovery `node_id`/`object_id` segments.

  **Breaking change / migration:** any topic segment derived from a device or entity name that contained characters outside `[A-Za-z0-9_]` will now have a different name (e.g. `Living-Room` becomes `Living-20Room`). Home Assistant will create new entities under the new topics. After upgrading, delete the now-orphaned MQTT devices/entities from Home Assistant (Settings → Devices & services → MQTT) so the stale duplicates are removed.

### Patch Changes

- [#210](https://github.com/bourquep/mysa2mqtt/pull/210) [`3229264`](https://github.com/bourquep/mysa2mqtt/commit/32292646a27ea8d58a43864bb9255553114df4b7) Thanks [@bourquep](https://github.com/bourquep)! - Stop publishing a meaningless `state_topic` for buttons ([#157](https://github.com/bourquep/mysa2mqtt/issues/157)).

  A button is command-only in the Home Assistant MQTT spec, but `Button` was passing a placeholder `state_topic` to satisfy the `Subscriber`/`Discoverable` base classes, which added a retained topic per button. `Subscriber` now supports command-only entities with no state topics (a subscriber is already interactive through its command topics), and `Button` no longer declares a state topic. Stateful subscribers (`Switch`, `Climate`) are unchanged.

## 4.2.0

### Minor Changes

- [#200](https://github.com/bourquep/mysa2mqtt/pull/200) [`61dc2a2`](https://github.com/bourquep/mysa2mqtt/commit/61dc2a2b395397e9e5245098bfd31b49b501fd7d) Thanks [@bourquep](https://github.com/bourquep)! - V2 thermostats can now report power. These devices have no current sensor and only report the duty cycle of their heating relay, which is why their **Current power** sensor has always been unavailable. Set the new `--heater-watts` option (`M2M_HEATER_WATTS`) to the rated wattage of the heaters each thermostat controls — for example `M2M_HEATER_WATTS="Kitchen=1500,<device-id>=750"`, matching devices by name or id — and power is estimated as `duty cycle × rated wattage`. V1 thermostats measure their own current and continue to work with no configuration.

  The power sensor is now only created for devices that can actually report a value. If you have AC devices, or V2 thermostats for which you have not configured a wattage, their **Current power** entity is removed from Home Assistant on startup; it only ever showed as unavailable.

  `mqtt2ha` gains a `Discoverable.removeConfig()` method, which clears an entity's retained discovery topic so Home Assistant drops the entity. This is what makes the removal above take effect: because `writeConfig()` retains its payload, an entity published by an earlier run persists until its topic is explicitly cleared.

### Patch Changes

- [#195](https://github.com/bourquep/mysa2mqtt/pull/195) [`4911b04`](https://github.com/bourquep/mysa2mqtt/commit/4911b04c15349e6d508717bf0880346fa1ed9b80) Thanks [@vavallee](https://github.com/vavallee)! - The tls_key, tls_certfile and tls_ca_cert settings are now actually forwarded to the MQTT client when use_tls is enabled. They were previously accepted and silently ignored, so mutual TLS setups connected without their configured certificates. The files are read at client creation and an unreadable path now fails loudly instead of degrading silently.

## 4.1.5

### Patch Changes

- [#187](https://github.com/bourquep/mysa2mqtt/pull/187) [`7affd92`](https://github.com/bourquep/mysa2mqtt/commit/7affd92614ee6f8ac160afacae7c7ea1c3a2a9e9) Thanks [@vavallee](https://github.com/vavallee)! - Errors thrown while subscribing to command topics or handling a received command are now caught and logged instead of escaping as unhandled promise rejections, which could terminate the process under Node's default rejection policy.

## 4.1.4

### Patch Changes

- [#149](https://github.com/bourquep/mysa2mqtt/pull/149) [`89e2950`](https://github.com/bourquep/mysa2mqtt/commit/89e2950c4874db14ea9b682380c63984aaf7a9f4) Thanks [@bourquep](https://github.com/bourquep)! - Moved development into the [mysa2mqtt monorepo](https://github.com/bourquep/mysa2mqtt).

  There are no functional changes in this release. The package's repository and homepage links now point at the monorepo, and issues for all three packages are tracked at https://github.com/bourquep/mysa2mqtt/issues.

## Releases prior to 4.1.3

This package previously lived in its own repository and used semantic-release, which published its release notes to GitHub Releases rather than to a changelog file.

See the [release history of the archived repository](https://github.com/bourquep/mqtt2ha/releases) for notes on versions up to and including 4.1.3.
