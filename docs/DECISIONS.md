# Engineering decisions

This document records the decisions made while merging the outstanding branches and advancing the project, so they can
be reviewed asynchronously. It is intentionally candid about trade-offs and open questions.

> **Positioning:** the project is being targeted as an **"electricity usage → MQTT"** bridge. This is
> **positioning/prioritization, not a scope cut** — we still collect _all_ device data (temperature, humidity, mode,
> status, …) and still provide _control_ (thermostat setpoint/mode/fan today; charger control via OCPP later). Energy is
> the headline use case that orders the backlog (`docs/BACKLOG.md`), not a boundary.

## 1. Merged the `patch-2` branch

`patch-2` only added `mysa.md`, a reverse-engineered reference of the Mysa REST + AWS IoT MQTT API (auth flow, topics,
message schemas, plus a sketch of a Python client). It had diverged from an old `main`, so it was merged with a merge
commit. There were no file conflicts (it only adds `mysa.md`).

`mysa.md` did not conform to the repository's Prettier config (`proseWrap: always`, width 120), and CI runs
`prettier -c .` across the whole repo, so it was reformatted with Prettier. Only prose wrapping changed — all 22 code
fences and their contents were preserved verbatim.

## 2. Extracted the pure logic into `src/conversions.ts` (behavior-preserving)

`src/thermostat.ts` mixed a lot of pure decision logic (mode/fan-speed mapping, power estimation, setpoint
normalization, climate-action computation) in with the stateful MQTT/Mysa wiring, which made it effectively untestable.

That logic was moved, **without behavioral changes**, into `src/conversions.ts` as small pure functions:

- `deviceTypeFromModel` — `AC` vs `BB` from the model string.
- `resolveCommandedMode` / `resolvePowerCommandMode` / `resolveCommandedFanMode` — validate inbound HA commands.
- `normalizeSetpointCelsius` — the Fahrenheit snap-to-0.5 °C / clamp behavior.
- `computePowerWatts` — the V1 (current) and V2 (duty-cycle) power calculations.
- `computeClimateAction` — the `heating`/`cooling`/`idle`/… decision.
- The raw-value lookup maps (`MYSA_RAW_MODE_TO_DEVICE_MODE`, `MYSA_RAW_FAN_SPEED_TO_FAN_SPEED_MODE`) and the HA
  mode/fan-mode constants.

`thermostat.ts` now imports and calls these. The odd inherited type annotations (e.g. `Partial<MysaDeviceMode>[]`) were
kept verbatim to guarantee identical compilation and runtime behavior; cleaning them up is deferred to a separate,
clearly-scoped change.

## 3. Added a unit-test suite (Vitest)

There were previously no tests. Added `vitest` and `src/conversions.test.ts` with 31 tests covering every extracted
function and its edge cases (snap-before-clamp, current-takes-precedence-over-duty-cycle, unknown/`auto` modes, unusable
`MaxCurrent` strings, etc.). Tests are colocated with the source under `src/` so they are also type-checked by `tsc` and
linted by ESLint.

Added scripts: `npm test`, `npm run test:watch`, and `npm run typecheck`.

## 4. Graceful shutdown on `SIGINT`/`SIGTERM`

Previously, `main()` started the thermostats and the process simply stayed alive on its open connections; there was no
signal handling, so `docker stop` / `systemctl stop` (which send `SIGTERM`) killed the process abruptly with no cleanup,
and `Thermostat.stop()` was never called by anything.

`main.ts` now registers `SIGINT`/`SIGTERM` handlers that stop every thermostat and exit `0`, with a 10 s safety timer
that forces exit if a stop hangs (so a wedged broker connection can't pin a container open). `Thermostat.stop()` was
hardened to (a) tolerate a failed Mysa disconnect during shutdown and (b) mark the Home Assistant entities unavailable,
so they show as offline rather than displaying stale values. This was verified at runtime: sending `SIGTERM` to the
built CLI now logs the shutdown and exits with code `0`.

Note: `mqtt2ha` already configures an MQTT Last Will & Testament by default, so entities also go unavailable on an
_ungraceful_ disconnect; the explicit `setAvailability(false)` simply makes the graceful case immediate and certain.

## 5. CI now type-checks and tests

`tsup` (esbuild) does not perform full type-checking, and CI only ran `style-lint`, `lint`, and `build` — so type errors
and test regressions could land on `main`. The `lint` job now also runs `npm run typecheck`, a new `test` job runs
`npm test`, and `build` now depends on both `lint` and `test`. The `release`/`docker` jobs are unchanged and remain
gated behind `workflow_dispatch`.

## 6. Generalized into a pluggable bridge (adapter architecture)

To take the project toward a general "any source → MQTT/Home Assistant" bridge, the runtime was refactored around a
small `SourceAdapter` contract driven by a `BridgeManager` (see `docs/GENERAL_BRIDGE.md`).

- `src/bridge/types.ts` defines `SourceAdapter` (`id`, `displayName`, `start()`, `stop()`).
- `src/bridge/manager.ts` starts/stops a set of adapters, tolerating per-adapter failures (but requiring at least one to
  start). It is unit-tested with a fake adapter.
- The Mysa logic that used to live in `main.ts` moved, **behavior-preserved**, into `MysaAdapter`
  (`src/adapters/mysa/`). The Mysa code (thermostat, conversions, session) was relocated under `src/adapters/mysa/`.
- A second, fully working reference adapter — `SystemAdapter` (`src/adapters/system/`) — publishes host metrics (uptime,
  load, memory) as Home Assistant sensors using only Node's `os` module. It is **opt-in** via `--system-sensors true` /
  `M2M_SYSTEM_SENSORS=true`, so default behavior is unchanged.
- `version` was extracted from `options.ts` into a side-effect-free `src/version.ts`, so importing adapters in tests no
  longer triggers CLI parsing (`options.ts` calls `process.exit` on missing required flags at import time).

Decisions worth flagging for review:

- **No non-functional protocol stubs were shipped.** Zigbee/Z-Wave/Matter/Thread/BLE/HealthKit cannot be implemented or
  tested here without real hardware (or, for HealthKit, an iOS device — it has no server-side API). Instead there's a
  real extensibility seam plus an honest per-protocol roadmap in `docs/GENERAL_BRIDGE.md`. For Zigbee/Z-Wave especially,
  the roadmap recommends reusing the mature Zigbee2MQTT / Z-Wave JS projects rather than duplicating them.
- **The package/binary/Docker name stays `mysa2mqtt`.** Renaming a published artifact is outward-facing and hard to
  reverse, so it was left for a deliberate maintainer decision (this is a fork of `bourquep/mysa2mqtt`).
- **`SystemAdapter` MQTT publishing was not exercised end-to-end here** (no broker in this environment). Its pure metric
  logic is unit-tested, it type-checks, and it uses the exact same `mqtt2ha` API as the proven Mysa `Thermostat`. The
  `BridgeManager` lifecycle is unit-tested with a fake adapter.

## 7. Cleaned up per-model hardware support

Capability decisions for the non-`BB-V1` models were scattered (a `Model.startsWith('AC')` check) and every device —
even ones that can't measure power — got a power sensor that sat permanently at `None`. This was consolidated into a
tested `src/adapters/mysa/capabilities.ts`:

- `parseModel()` parses a model string (`BB-V2-1-L` → family `BB`, generation `2`, `isLite: true`).
- `getDeviceCapabilities()` returns `deviceType`, `supportsCooling`, `supportsFan`, and `reportsPower`.
- `Thermostat` now **only creates the power sensor when `reportsPower` is true**. That excludes AC controllers (IR
  blasters that measure nothing) and `BB-*-L` "Lite" units (which the docs note don't report power). Behavior for
  `BB-V1`/`BB-V2`/in-floor is unchanged.

Notable, deliberate constraints:

- **AC swing / vane position cannot be added here.** The `mysa-js-sdk` control surface is
  `setDeviceState(setPoint, mode, fanSpeed)` only — there is no swing/position parameter — so this is an upstream SDK
  limitation, not something this bridge can implement. Documented rather than faked.
- **AC mode advertising was left as the full set.** `SupportedCaps.modes` could narrow the advertised HA modes to what a
  specific AC supports, but the `modeId` → mode mapping is unverified without a real device, so this was not changed.
- **Removing the power entity for AC/Lite is a (minor) discovery change.** Existing installations may keep an orphaned
  `..._power` entity in Home Assistant until it is manually removed. This was judged the correct cleanup since the
  sensor never carried a real value for those models.

## 8. Power/energy: derived energy sensor, opt-in estimate, and an experimental cloud energy probe

Following research into whether richer power/energy data is available (see the sources in section 9), three changes were
made:

- **Cumulative energy sensor.** `EnergyAccumulator` (`energy.ts`, unit-tested) integrates the instantaneous power over
  time into a kWh total, published as a `total_increasing` `energy` sensor — directly usable in the Home Assistant
  Energy dashboard. It resets to zero on restart (not persisted); HA tolerates `total_increasing` resets. Created
  alongside the power sensor.
- **Opt-in estimated current.** `--mysa-estimated-current <amps>` supplies a fallback current rating so duty-cycle
  devices that don't report one (the "Lite" models) can still get estimated power/energy. This mirrors the approach used
  by the `kgelinas/Mysa_HA` integration.
- **Experimental cloud energy API (`--mysa-energy-api`).** Mining `dlenski/mysotherm` and `kgelinas/Mysa_HA` identified
  the real endpoint: **`POST /energy/device/{deviceId}`** on `app-prod.mysa.cloud` (the legacy host that shares our
  SDK's auth), with body `{ PhoneTimezone, Scope, Timestamp }` — _not_ the `/energy/v3/...` GET originally hypothesized
  (which does not exist). The newer `mysa-backend.mysa.cloud` host exposes `GET /telemetry/usage/{id}` →
  `{ data: [{ timestamp, runtime, energyUsed }] }`, but uses a different Cognito client so our token may not work there.
  The feature is therefore **opt-in, off by default, and fail-soft**: it POSTs the legacy endpoint, logs the raw
  response (the response schema still isn't publicly documented), and only publishes a clearly-labeled sensor when
  `extractEnergyKwh` finds an unambiguous total. The HTTP/auth/body construction and the extractor are unit-tested with
  a mock fetcher; **the live response schema remains unverified** and must be confirmed before relying on the sensor.
  Note that `kgelinas/Mysa_HA` does not use this endpoint for its energy sensor at all — it integrates power over time,
  exactly like our `EnergyAccumulator` — which is good corroboration that the local-integration approach is sound.

## 9. Reverse-engineering sources used for the Mysa API

To ground the above, the Mysa REST surface was extracted from two places:

- The installed `mysa-js-sdk` (authoritative for this project): base URL `https://app-prod.mysa.cloud`; `GET /devices`,
  `/devices/firmware`, `/devices/state`; MQTT `/v1/dev/{id}/{in,out}`; Cognito us-east-1 (`Authorization: <idToken>`).
  Notably it has **no** energy endpoint.
- Public reverse-engineering, primarily [`dlenski/mysotherm`](https://github.com/dlenski/mysotherm) and
  [`kgelinas/Mysa_HA`](https://github.com/kgelinas/Mysa_HA): the legacy `/users/readingsForUser` endpoint is dead;
  current device data is `GET /devices/state` + `GET /users`; in-app energy is software-computed from duty cycle ×
  wattage; mysotherm's captures show `dtyCycle` as a **0–1 fraction** (relay on = `1.0`).

## 11. First non-Mysa device adapter: Tesla Wall Connector (EV charger)

Following the Canadian-charger effort analysis (`docs/SOURCE_RESEARCH.md`), the **Tesla Wall Connector (Gen 3)** was
chosen as the first EV-charger adapter: highest install base _and_ lowest effort (unauthenticated local JSON), and fully
testable without hardware.

- `src/adapters/tesla-wall-connector/vitals.ts` — pure normalization of the `/api/1/vitals` (+ `/api/1/lifetime`)
  payloads into a Home-Assistant-ready snapshot, including a per-phase `Σ V×I` power estimate. Heavily unit-tested.
- `client.ts` — a tiny injectable-`fetch` HTTP client with a per-request abort/timeout (the firmware is known to hang
  under prolonged polling).
- `adapter.ts` — a `SourceAdapter` that polls every 30 s and publishes 6 sensors + 2 binary sensors
  (`vehicle_connected`, `charging`), mirroring the `SystemAdapter` lifecycle (timer `unref`, mark-unavailable on stop).
- Enabled by `--tesla-wall-connector-host` / `M2M_TESLA_WALL_CONNECTOR_HOST`.

Deliberate decisions:

- **Monitor-only.** The Wall Connector's local API is read-only — no start/stop or charge-rate. Rather than fake
  controls, the adapter exposes only sensors and the docs say so plainly. Real charger _control_ is slated for an
  eventual OCPP layer (see `docs/SOURCE_RESEARCH.md`).
- **Verified end-to-end, not just unit-tested.** Beyond the unit tests, the adapter was run against a stub Wall
  Connector HTTP server and a real in-process MQTT broker (`aedes`): it published 8 discovery configs and correct state
  (e.g. `power = 5760 W` from 240 V × 24 A, `charging = ON`). The broker/stub were dev-only (`--no-save`), so
  `package.json` is unchanged.
- **Graceful degradation:** if `/api/1/lifetime` is missing on a given firmware, the adapter logs once and stops
  querying it rather than erroring each poll.

## 12. Shelly energy meter adapter (whole-circuit electricity usage)

Aligned with the energy-usage positioning, added a `ShellyEmAdapter` (`src/adapters/shelly-em/`) — Shelly EM devices are
cheap, ubiquitous, **local** whole-circuit/whole-home monitors, so they sit at the center of the energy mission.

- `readings.ts` — pure normalization of all three Shelly report shapes into one `EnergyMeterReading`: Gen2 three-phase
  (`EM` + `EMData`), Gen2 single-phase (`EM1` + `EM1Data`), and Gen1 (`/status` `emeters`). Field names taken from the
  official Shelly Gen2 docs; energy converted Wh→kWh. Fully unit-tested.
- `client.ts` — auto-detects the variant by probing `EM` → `EM1` → `/status` (cached), with injectable `fetch` and a
  per-request abort/timeout.
- `adapter.ts` — polls every 15 s; publishes total power/current/voltage, cumulative energy (kWh, `total_increasing`),
  returned energy (disabled by default), and **lazily-created per-phase power** sensors. Mirrors the established adapter
  lifecycle.
- Enabled via `--shelly-em-host` / `M2M_SHELLY_EM_HOST`.

Verified end-to-end (stub Shelly Pro 3EM HTTP server + in-process `aedes` MQTT broker): auto-detected Gen2, published 8
discovery configs and correct values (power 3300.5 W, energy 25.000 kWh from 25000 Wh, phase-A power 1000 W).

## Open questions / things deliberately NOT changed

These were noticed but intentionally left alone, because changing them safely needs a real device or maintainer input.
They are surfaced here rather than silently "fixed".

- **Duty-cycle units for V2 power estimation (now corroborated).** `mysa-js-sdk`'s `Status.dutyCycle` is documented as
  "a percentage (0–100)", but the existing power math (`voltage × maxCurrent × dutyCycle`) only yields sensible wattages
  if it is a fraction (0–1). Public captures in `dlenski/mysotherm` show `dtyCycle` as a 0–1 fraction (relay on =
  `1.0`), so the current 0–1 assumption is very likely correct and the SDK docstring is misleading. Remaining risk: the
  SDK could theoretically rescale before emitting — worth one confirmation on a real `BB-V2`.
- **`auto` mode climate action.** `computeClimateAction` returns `idle` for `auto` (it is not a case in the original
  switch), so an AC running in `auto` reports `idle` even while actively heating/cooling. Preserved as-is; a future
  enhancement could map `auto` to the actual active action when the device reports it.
- **AC swing / vane position.** Still unimplemented — and not implementable through the current SDK, whose only control
  call is `setDeviceState(setPoint, mode, fanSpeed)` (see section 7). Would require upstream `mysa-js-sdk` support.
- **Inherited loose typings** (`Partial<MysaDeviceMode>[]`, `state.X?.v as number` casts) were preserved to keep this
  change behavior-preserving.
