# Engineering decisions

This document records the decisions made while merging the outstanding branches and advancing the project, so they can
be reviewed asynchronously. It is intentionally candid about trade-offs and open questions.

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

## Open questions / things deliberately NOT changed

These were noticed but intentionally left alone, because changing them safely needs a real device or maintainer input.
They are surfaced here rather than silently "fixed".

- **Duty-cycle units for V2 power estimation.** `mysa-js-sdk`'s `Status.dutyCycle` is documented as "a percentage
  (0–100)", but `mysa.md` and the existing power math (`voltage × maxCurrent × dutyCycle`) only produce sensible
  wattages if it is a fraction (0–1). The current code treats it as 0–1 and that behavior was preserved. Worth
  confirming against a real V2 (`BB-V2`) device; if the SDK really emits 0–100, the estimate is 100× too high.
- **`auto` mode climate action.** `computeClimateAction` returns `idle` for `auto` (it is not a case in the original
  switch), so an AC running in `auto` reports `idle` even while actively heating/cooling. Preserved as-is; a future
  enhancement could map `auto` to the actual active action when the device reports it.
- **AC swing / vane position.** Still unimplemented (the README already lists this as a known gap); out of scope here.
- **Inherited loose typings** (`Partial<MysaDeviceMode>[]`, `state.X?.v as number` casts) were preserved to keep this
  change behavior-preserving.
