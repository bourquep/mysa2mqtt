# Toward a general bridge

`mysa2mqtt` started as a single-vendor bridge (Mysa → MQTT/Home Assistant). This document describes the **adapter
architecture** that lets it bridge additional sources, the two adapters that ship today, and an honest, per-protocol
roadmap for the sources that have been requested (Zigbee, Z-Wave, Matter/Thread, BLE, HealthKit, …).

> **Status:** the architecture and the Mysa + System adapters are implemented and shipping. The protocol adapters below
> are **not** implemented — this is a design and feasibility roadmap, not a claim of support. See the "Why not ship
> stubs" note at the end.

## Architecture

The core is deliberately tiny. Every source implements one interface and is driven by one manager.

```
                    +--------------------------------------------------+
                    |                    main.ts                       |
                    |  buildAdapters(options) -> SourceAdapter[]       |
                    |  new BridgeManager(adapters).start()             |
                    |  SIGINT/SIGTERM -> BridgeManager.stop()          |
                    +-------------------------+------------------------+
                                              |
                          +-------------------+-------------------+
                          |                                       |
                +---------v---------+                   +---------v---------+
                |    MysaAdapter    |                   |   SystemAdapter   |   ... future adapters
                | (SourceAdapter)   |                   |  (SourceAdapter)  |
                +---------+---------+                   +---------+---------+
                          |  mqtt2ha (Climate/Sensor/...)         | mqtt2ha (Sensor)
                          +-------------------+-------------------+
                                              v
                                    +-------------------+
                                    |   MQTT broker     |  -> Home Assistant discovery
                                    +-------------------+
```

- **`SourceAdapter`** (`src/bridge/types.ts`) — the contract: `id`, `displayName`, `start()`, `stop()`.
- **`BridgeManager`** (`src/bridge/manager.ts`) — starts every adapter (tolerating individual start failures, but
  requiring at least one to start), and stops them all on shutdown (tolerating individual stop failures). It is the
  single owner of lifecycle and is fully unit-tested with a fake adapter.
- **`buildAdapters()`** (`src/main.ts`) — the composition root: turns CLI/env configuration into the set of enabled
  adapters.
- Adapters use the existing **`mqtt2ha`** primitives (`Climate`, `Sensor`, `BinarySensor`, `Switch`, `Button`) to
  publish Home Assistant discovery and state. They never talk to MQTT directly.

### Writing a new adapter

A minimal adapter is just a class:

```ts
import { MqttSettings, Sensor } from 'mqtt2ha';
import pino from 'pino';
import { SourceAdapter } from '../../bridge/types';
import { PinoLogger } from '../../logger';

export class MyAdapter implements SourceAdapter {
  readonly id = 'my';
  readonly displayName = 'My source';

  private readonly entities: Sensor[] = [];

  constructor(
    private readonly config: MyConfig,
    private readonly mqttSettings: MqttSettings,
    private readonly logger: pino.Logger
  ) {}

  async start(): Promise<void> {
    // 1. Connect to the upstream system.
    // 2. Discover devices; for each, create mqtt2ha entities and `await entity.writeConfig()`.
    // 3. Subscribe to upstream updates; on each, `await entity.setState(...)`.
  }

  async stop(): Promise<void> {
    // Stop timers/subscriptions, then mark entities unavailable:
    await Promise.all(this.entities.map((e) => e.setAvailability(false)));
  }
}
```

Then register it in `buildAdapters()` behind a config flag, gather any pure decision logic into a sibling module with
unit tests (as `src/adapters/mysa/conversions.ts` does), and add an enable option in `src/options.ts`.

`src/adapters/system/` is the smallest end-to-end example: it reads Node's `os` module and publishes four sensors.

## Shipping adapters

| Adapter  | Source         | Status                              | Enable                                |
| -------- | -------------- | ----------------------------------- | ------------------------------------- |
| `mysa`   | Mysa cloud API | ✅ Full (climate + sensors)         | Always on (Mysa credentials required) |
| `system` | Host `os`      | ✅ Reference (uptime, load, memory) | `--system-sensors true`               |

## Protocol roadmap (not yet implemented)

Each entry notes the realistic Node approach, the effort, and — importantly — whether a best-in-class tool already
solves it better, because for several of these the right answer is "point Home Assistant at the existing project" rather
than reimplement it here.

### Zigbee

- **Approach:** `zigbee-herdsman` (the engine behind Zigbee2MQTT) with a supported coordinator (ConBee, Sonoff, etc.).
- **Reality check:** [Zigbee2MQTT](https://www.zigbee2mqtt.io/) already does exactly this — MQTT + HA discovery — and
  supports thousands of devices. A native adapter would duplicate a very large project for little gain.
- **Recommendation:** integrate by running Zigbee2MQTT alongside; only build an adapter if normalizing/merging Zigbee
  devices into the same device tree proves valuable. **Effort: high. Marginal value: low.**

### Z-Wave

- **Approach:** [`zwave-js`](https://github.com/zwave-js/node-zwave-js) (excellent, pure-Node) with a Z-Wave controller
  stick.
- **Reality check:** [Z-Wave JS UI](https://github.com/zwave-js/zwave-js-ui) already bridges Z-Wave JS to MQTT + HA, and
  Home Assistant has a first-party Z-Wave JS integration.
- **Recommendation:** same as Zigbee — reuse the mature tool. A thin adapter is feasible but low-value. **Effort:
  medium–high. Marginal value: low.**

### Matter

- **Approach:** [`@project-chip/matter.js`](https://github.com/project-chip/matter.js) provides a Node controller that
  can commission and control Matter devices; map Matter clusters → HA entities, persist the fabric/credentials.
- **Reality check:** Home Assistant ships a native Matter Server. A standalone Matter adapter is a real, substantial
  project (commissioning UX, fabric storage, cluster mapping).
- **Recommendation:** highest-value _new_ protocol if the goal is a self-contained controller, but scope it as its own
  effort. **Effort: high.**

### Thread

- **Reality check:** Thread is not an application protocol you bridge directly — it's a low-power IPv6 mesh
  **transport** that, in the smart-home world, carries **Matter**. "Thread support" in practice means
  _Matter-over-Thread_ plus a **Thread Border Router** (e.g. OpenThread Border Router, or the one built into HA / Apple
  / Google hubs).
- **Recommendation:** covered by the Matter adapter + an external border router; there is no separate Node "Thread
  adapter" to build. **Effort: n/a (folds into Matter).**

### BLE (Bluetooth Low Energy)

- **Approach:** `@abandonware/noble` (cross-platform) or `node-ble` (Linux/BlueZ over D-Bus) to scan and read GATT.
- **Reality check:** BLE payloads are vendor-specific, so a useful adapter needs **per-device decoders** (this is what
  [Theengs](https://theengs.io/) does). A generic "BLE adapter" without device profiles only yields raw bytes. Requires
  a Bluetooth radio on the host, so it cannot be exercised in CI.
- **Recommendation:** feasible for a curated set of sensors; design around pluggable per-device decoders. **Effort:
  medium, ongoing per-device.**

### HealthKit

- **Reality check:** Apple HealthKit is an **on-device iOS framework with no server-side API**. A Node daemon on a
  server/Docker host **cannot** read HealthKit. The only viable paths are (a) a companion iOS app/Shortcut that pushes
  data out over HTTP/MQTT, or (b) importing Apple Health export files. There are also real **privacy** implications to
  publishing health data onto an MQTT bus.
- **Recommendation:** out of scope for a server-side bridge; if pursued, define an _inbound_ ingest endpoint that a
  companion app posts to, rather than a HealthKit "adapter". **Effort: requires a separate iOS component.**

## Naming

The package, binary, and Docker image remain **`mysa2mqtt`**. Renaming a published npm package / Docker image is an
outward-facing, hard-to-reverse decision for the maintainer, so it was intentionally left alone even though the project
now has a general bridge core. If the project formally pivots to a general bridge, a rename (e.g. `hub2mqtt`) with an
alias/deprecation path would be a deliberate, separate change.

## Vendor cloud / hub APIs — the natural next adapters

The protocol roadmap above (Zigbee/Z-Wave/Matter/…) is mostly "reuse the mature tool." This project's actual sweet spot
is different and underserved: **vendor cloud or LAN APIs** that, like Mysa, authenticate over HTTP, discover devices,
and stream/poll state — exactly the shape `MysaAdapter` already demonstrates. These need **no special radio**, so they
build and unit-test in CI with a mocked `fetch` (see `energy-api.test.ts` / `diagnostics.test.ts` for the pattern), and
each becomes a self-contained adapter behind the existing `SourceAdapter` contract.

Ranked by fit for this codebase:

| Candidate                                      | Transport / library                                                                     | Auth                                | Fit               | Notes                                                                                                                                                                                |
| ---------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **IKEA DIRIGERA**                              | **Local** REST over HTTPS :8443 — [`dirigera`](https://github.com/lpgera/dirigera) (TS) | One-time button-press token pairing | ⭐ High           | Local-only (no cloud), maintained typed Node lib, long-lived token. Lights/plugs/blinds/sensors map cleanly to `mqtt2ha` `Light`/`Switch`/`Sensor`/`Cover`. Cleanest first addition. |
| **SmartThings**                                | Cloud REST (`api.smartthings.com`) + webhooks/SSE                                       | OAuth2 (PATs now 24 h, Dec 2024)    | ⭐ High (breadth) | One adapter exposes _many_ vendors. Must implement OAuth2 refresh — PATs are test-only now. Huge device-type surface → start read-only (sensors) then add control.                   |
| **Govee**                                      | Platform OpenAPI (cloud) + optional LAN                                                 | API key                             | Med               | Already well-served by [`wez/govee2mqtt`](https://github.com/wez/govee2mqtt); build only if unifying into one device tree. Lights/RGB + some temp/humidity.                          |
| **Tuya / Smart Life**                          | Tuya Cloud API (region DCs)                                                             | Cloud project id/secret             | Med               | Enormous device catalog but heavy onboarding (Tuya IoT project, region, app-account link). LocalTuya needs per-device keys. High value, high setup cost.                             |
| **Sensibo / Ecobee / other cloud thermostats** | Vendor cloud REST                                                                       | API key / OAuth2                    | Med               | Closest to the existing climate domain; small, well-documented APIs; reuse the `Climate` entity already wired for Mysa.                                                              |

**Recommended order:**

1. **IKEA DIRIGERA** — best risk/reward: local, typed lib, no OAuth, broad device coverage, fully CI-testable with a
   mocked client. A strong template for "hub on the LAN → MQTT".
2. **SmartThings** — highest reach per unit of work (one integration → many brands), and proves the OAuth2 + webhook
   pattern the cloud adapters will share. Scope it read-only first.
3. **A second cloud thermostat** (Sensibo or Ecobee) — directly reuses the `Climate` work and keeps the project's
   thermostat identity while it generalizes.

Govee and Tuya are valuable but either already well-covered (Govee) or heavy to onboard (Tuya), so they rank lower as
_first_ additions.

### Shared groundwork these will want

- An **OAuth2 token store** (authorize once, persist + refresh) — generalize `src/adapters/mysa/session.ts` into a
  reusable helper. SmartThings/Ecobee/Sensibo all need it.
- A small **HA entity-mapping helper** (capability → `Light`/`Switch`/`Sensor`/`Cover`/`Climate`) so each adapter only
  maps its own vocabulary, mirroring `src/adapters/mysa/capabilities.ts`.
- Per-adapter **enable flags + config** in `src/options.ts`, exactly like `--system-sensors` / `--mysa-*`.

## Why not ship non-functional protocol stubs?

Shipping empty `ZigbeeAdapter`/`MatterAdapter`/… classes that throw "not implemented" would add unverifiable, misleading
code to the build. None of the requested protocols can be meaningfully implemented **or tested** in CI without real
radios/hardware (or, for HealthKit, an iOS device). The honest, higher-quality deliverable is a real, tested
extensibility seam (this architecture + the two working adapters + the fake-adapter tests) plus this concrete roadmap.
Pick the protocol you want next and it can be built against this interface.
