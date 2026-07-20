# mqtt2ha

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
