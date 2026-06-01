# Backlog

This is the working backlog for evolving the project. For the architecture see `docs/GENERAL_BRIDGE.md`; for source
feasibility see `docs/SOURCE_RESEARCH.md`; for decisions see `docs/DECISIONS.md`.

## Positioning (not a scope limit)

The project is being **positioned/targeted as an "electricity usage → MQTT" bridge** — that framing guides naming, docs,
and prioritization. It is **not** a reduction in scope:

> We still collect **all** available device data (temperature, humidity, mode, fan, status, …) **and** we still provide
> **control** (thermostat setpoint/mode/fan today; charger control via OCPP and other write paths over time). Energy is
> the headline use case and ordering principle, not a boundary.

Concretely, that means: prefer sources/metrics that surface real electricity usage first, but never drop the climate /
status / control capabilities that already exist or are planned.

## Shipped

- ✅ Mysa thermostats — climate **control** (mode/fan/setpoint) + temp/humidity + **power & energy (kWh)**.
- ✅ System metrics (host uptime/load/memory) — reference adapter.
- ✅ Tesla Wall Connector (Gen 3, local) — power/current/voltage/energy + session/charging (monitor-only).
- ✅ Shelly energy meter (Pro 3EM / EM / Gen1, local) — whole-circuit power/current/voltage/energy + per-phase power.
- ✅ **Shared energy helper** (`src/energy/`) — one `PowerEnergyPublisher` emits the standard power (W) + energy (kWh,
  `total_increasing`) entities, with **derived** (integrate power) or **measured** (device kWh) modes, and an **optional
  cost** sensor created **only when a `--cost-per-kwh` rate is supplied** (otherwise downstream/HA applies the rate).
  Mysa, Shelly EM/Plug now use it (Tesla still queued).
- ✅ **Shelly smart plug** (Plus/Pro/Gen1, local) — power/energy (+cost) + voltage/current/temperature **and on/off
  control**. First adapter with a write/control entity.
- ✅ **Energy-only safety switch** (`--energy-only`) — bridge-wide `OutputPolicy` that structurally restricts every
  adapter to electricity-usage output (no control, no other telemetry). Verified end-to-end.
- ✅ **Tasmota** (any flashed plug, local MQTT) — subscribes to `tele/.../SENSOR`+`STATE`, republishes
  power/energy/voltage/current/power-factor + **on/off control** (`cmnd/.../POWER`). Verified end-to-end.
- ✅ **Emporia Vue** (cloud) — whole-home **mains + per-circuit** power/energy (+cost) trios. Verified end-to-end
  against a stub API. Token is supplied via `--emporia-id-token` for now (see follow-up below).

## Now / next

- ⏭️ **Demand-response device batch** — Sinopé/Neviweb (thermostats + load controller + Calypso), Wallbox, Emporia
  chargers, Rheem EcoNet, ChargePoint, SolarEdge batteries. Design + API feasibility in `docs/DR_DEVICES.md`; approved
  for implementation as one PR (Eguana deferred — no public API).
- ⏭️ **Emporia Cognito login** — obtain/refresh the ID token from username/password (reuse the planned OAuth2/token
  store) so the Emporia adapter doesn't require a manually-supplied `--emporia-id-token`.
- ⏭️ **TP-Link Kasa/Tapo** smart plugs (local) — next in the plug family.
- ⏭️ Retrofit the **Tesla** adapter onto `PowerEnergyPublisher` (Mysa, both Shelly adapters, Tasmota, Emporia use it).
- ⏭️ **OCPP central system** — vendor-agnostic EV-charger **control + energy** (covers Grizzl-E and many others).

## WiFi / LAN smart plugs & energy-metering devices

Cheap, ubiquitous per-outlet/per-device electricity monitors — directly on-mission and mostly **local**. Many share
plumbing with the Shelly EM adapter already shipped.

| Device family                      | Local? | API                                               | Effort     | Notes                                                                              |
| ---------------------------------- | ------ | ------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------- |
| **Shelly Plug/Plus/PlusPlugS/Pro** | Local  | Gen2 RPC (`Switch.GetStatus` `apower`/`aenergy`)  | ✅ Shipped | Power/energy + on/off **control**; gated by the energy-only safety switch.         |
| **Tasmota** (any flashed plug)     | Local  | native MQTT (`tele/.../SENSOR`, `cmnd/.../POWER`) | ✅ Shipped | Subscribes to its MQTT telemetry; power/energy + on/off control. Huge device base. |
| **TP-Link Kasa/Tapo (KP/HS/P110)** | Local  | Local TCP/UDP (KLAP/encrypted for newer)          | 🟡 Med     | Very popular; newer Tapo needs the KLAP handshake. Node libs exist.                |
| **ESPHome energy plugs**           | Local  | native API / **MQTT**                             | 🟢 Low     | If MQTT is enabled, near-zero work; otherwise the ESPHome native API.              |
| **Meross / Gosund / Wyze plugs**   | Cloud  | Vendor cloud (mostly reverse-engineered)          | 🟡 Med     | Cloud-bound; lower priority than the local options above.                          |

**Order:** Shelly Plug (reuses shipped code + adds control) → Tasmota (MQTT-native, massive base) → TP-Link Kasa/Tapo.

## Energy sources (electricity-usage first)

| Item                              | Value | Effort   | Notes                                                              |
| --------------------------------- | ----- | -------- | ------------------------------------------------------------------ |
| Emporia Vue (whole-panel/circuit) | High  | Med      | Cloud API; community libraries exist.                              |
| Shelly Plug/Plus/Pro (per-outlet) | Med   | Low      | Same Gen2 RPC / Gen1 `/status` plumbing as the EM adapter — reuse. |
| Tesla Powerwall / Gateway         | High  | Med      | Local API; whole-home + solar + battery flow.                      |
| Utility AMI / Green Button        | High  | Med      | The billing meter; downloadable usage, some utility APIs.          |
| Sense / Neurio                    | Med   | Med–High | Whole-home; Sense API unofficial/restricted.                       |

## More devices (full data + control — still in scope)

These continue the "collect everything + control" mandate; see `docs/SOURCE_RESEARCH.md` for API/effort detail.

- **Thermostats:** Resideo/Honeywell Lyric (open OAuth2 REST, control). Nest (high per-user setup). Tado (unofficial).
  Ecobee is **blocked** (closed API).
- **HVAC:** Sensibo (API key, control, reuses `Climate`), MELCloud (typed TS client), Daikin Onecta (200 req/day).
- **EV chargers:** Grizzl-E (local JSON read; OCPP for control), ChargePoint (cloud, reverse-engineered), Wallbox/Easee/
  Zaptec (cloud OAuth2). FLO is effectively blocked (no consumer API).
- **Hubs:** IKEA DIRIGERA (local REST, typed lib), SmartThings (OAuth2, broad multi-vendor reach).

## Cross-cutting groundwork

- **OAuth2 token store** — authorize once, persist + refresh; needed by Lyric, Daikin, Easee, Zaptec, Wallbox,
  SmartThings. Generalize `src/adapters/mysa/session.ts`.
- **Capability → HA entity mapper** — shared `Climate`/`Sensor`/`Switch`/`Number`/`Cover` mapping so each adapter only
  maps its own vocabulary (mirrors `src/adapters/mysa/capabilities.ts`).
- **Control plumbing for write-capable sources** — command-topic handling beyond Mysa (e.g. charger start/stop and
  charge-rate via OCPP), keeping the "we provide control" promise.
- **Energy persistence** — optionally persist cumulative kWh across restarts (today the derived totals reset on
  restart).
- **Project naming** — if/when the energy positioning is formalized, consider an alias (the package is still
  `mysa2mqtt`); an outward-facing, maintainer-owned decision.
