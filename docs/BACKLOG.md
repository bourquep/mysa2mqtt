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

## Now / next

- ⏭️ **Shared energy helper** — factor the power + `total_increasing` kWh sensor pattern (used by Mysa, Tesla, Shelly)
  into one reusable unit so every adapter emits Energy-dashboard-ready entities identically.
- ⏭️ **Cost sensors** — optional `$/kWh × kWh` cost entities (Mysa exposes `ERate`; make the rate configurable).
- ⏭️ **Emporia Vue** — popular whole-panel + per-circuit monitor (cloud API). High energy value.
- ⏭️ **OCPP central system** — vendor-agnostic EV-charger **control + energy** (covers Grizzl-E and many others).

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
