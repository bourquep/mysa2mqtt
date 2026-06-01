# Demand-response device support: API feasibility & design

This is the design/feasibility analysis for a requested batch of devices that together look like a **utility
demand-response (DR) / load-management program's eligible-device list** — controllable loads (EV chargers, thermostats,
water heaters, load controllers) plus storage (home batteries). The goal is **monitor + control** (curtail charging,
set-back setpoints, defer water heating, dispatch batteries) where each vendor's API allows.

> **Status: research/design only — nothing here is implemented yet.** Per the agreed plan, implementation follows once
> the per-vendor approach below is approved, delivered as one PR. Auth for these cloud vendors will follow the
> established pattern: injectable HTTP + pure tested parsers, credentials/keys/tokens via options, fail-soft with raw
> response logging for any unverified schema (as the Emporia and Mysa cloud-energy adapters already do).

## How the 11 devices map to adapters

Several requested devices share one vendor API, so 11 devices become **6 adapters** (4 genuinely new vendors; 2 extend
work already shipped):

| #   | Adapter                   | Covers (from the request)                                                                                  | New?                                                           |
| --- | ------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 1   | **Sinopé / Neviweb**      | Sinopé baseboard thermostat + LITE, smart **load controller**, Calypso water-heater controller **V1 + V2** | New (one API for 5 of the listed devices)                      |
| 2   | **Wallbox**               | Wallbox Pulsar Plus, Wallbox Pulsar Pro                                                                    | New                                                            |
| 3   | **ChargePoint**           | ChargePoint Level 2 networked chargers                                                                     | New                                                            |
| 4   | **Emporia (EV chargers)** | Emporia Pro + Classic Level 2 chargers                                                                     | **Extends** the shipped Emporia Vue adapter (same account/API) |
| 5   | **SolarEdge**             | SolarEdge home batteries                                                                                   | New                                                            |
| 6   | **Rheem EcoNet**          | Rheem ProTerra Hybrid water heater                                                                         | New                                                            |
| —   | **Eguana**                | Eguana home batteries                                                                                      | ⛔ No usable API found (see below)                             |
| —   | **Mysa**                  | Mysa baseboard + LITE                                                                                      | ✅ **Already shipped** — no work needed                        |

### Already covered

- **Mysa baseboard + LITE** are supported today (the original adapter; LITE handled via `--mysa-estimated-current` for
  power, per `docs/DECISIONS.md` §7).

## Per-adapter design

### 1. Sinopé / Neviweb — thermostats + load controller + Calypso (highest value: 5 devices, 1 API)

- **API:** Neviweb cloud (`neviweb.com` / `neviweb130`), the platform behind Sinopé. Well-mapped by the mature HA
  components [`claudegel/sinope-130`](https://github.com/claudegel/sinope-130) (GT130 + Wi-Fi devices) and
  [`sinope-1`](https://github.com/claudegel/sinope-1) (GT125). Login → session cookie/`appSession`; then
  `GET /v1/devices`, `GET /v1/device/{id}/attribute`, and `PUT /v1/device/{id}/attribute` to control.
- **Monitor:** room/setpoint temperature, heat level (→ power), `wattload`/`powerConnected` (the load controller and
  Calypso report wattage), water temperature (Calypso), relay state (load controller).
- **Control (DR):** set thermostat setpoint / outdoor-temp setback; load controller relay on/off; Calypso setpoint and
  on/off — exactly the curtailment levers a DR program wants.
- **Local option:** the GT125/GT130 gateway also speaks locally; cloud is simpler and uniform across all five devices.
- **Effort: Medium** (one client + per-device-type entity mapping). **Best ROI in the batch.**

### 2. Wallbox — Pulsar Plus / Pulsar Pro

- **API:** documented community API ([`SKB-CGN/wallbox`](https://github.com/SKB-CGN/wallbox), PyPI `wallbox`). Auth:
  `GET /auth/token/user` (Basic) → bearer token (~short-lived) → `GET /v2/charger/{id}` / `GET /chargers/status/{id}`.
- **Monitor:** charging power, session energy, status, added range.
- **Control (DR):** **pause / resume** charging, **set max charging current (A)**, lock/unlock — full curtailment.
  Pulsar Plus and Pro share the API.
- **Effort: Medium.** Strong DR fit.

### 3. ChargePoint — Level 2 networked chargers

- **API:** no official public API; the community
  [`mbillow/python-chargepoint`](https://github.com/mbillow/python-chargepoint) +
  [`ha-chargepoint`](https://github.com/mbillow/ha-chargepoint) reverse-engineer the app API. Auth: username/password →
  session token.
- **Monitor:** session state, power output, energy delivered, running cost, cable state.
- **Control (DR):** start/stop session, set amperage limit, restart.
- **Caveat:** reverse-engineered and account-based; more fragile than Wallbox. **Effort: Medium–High.**

### 4. Emporia EV chargers — Pro + Classic (extends shipped Emporia Vue)

- **API:** **same** `api.emporiaenergy.com` + Cognito auth the shipped **Emporia Vue** adapter already uses. Chargers
  appear in the same device tree; charger control is via the app API (`getDevicesUsage` for energy; a charger-settings
  endpoint for on/off + max amperage).
- **Monitor:** charging power/energy (already flows through the Vue usage path).
- **Control (DR):** on/off + charge-rate (charger-specific endpoint).
- **Effort: Low–Medium** — reuses the Emporia client/auth already built; add charger detection + control.

### 5. SolarEdge — home batteries

- **API (cloud):** official **SolarEdge Monitoring API** (api key + site id). `GET /site/{id}/storageData` (battery SoC,
  power, charge/discharge energy), `GET /site/{id}/currentPowerFlow` (live PV/load/battery/grid flow). **Hard limit: 300
  requests/day** → poll every ~15 min (the official HA integration does the same).
- **API (local, optional):** Modbus-TCP for high-rate local data (the `home-assistant-solaredge-modbus` route); more
  setup, no rate limit.
- **Monitor:** battery SoC, power, daily charge/discharge, whole-site power flow — core BESS telemetry.
- **Control (DR):** the public monitoring API is **read-only**; battery dispatch/charge-discharge control needs
  installer-level access or Modbus register writes. So: **monitor via cloud API; control is out of scope for the public
  API** (note for the program).
- **Effort: Medium** (cloud, read-only). Modbus control is a separate, larger effort.

### 6. Rheem EcoNet — ProTerra hybrid water heater

- **API (cloud):** Rheem **EcoNet** — there's a first-party HA integration (`pyeconet`, which uses EcoNet's cloud + an
  MQTT push channel). Auth: account email/password.
- **API (local, optional):** [`esphome-econet`](https://github.com/esphome-econet/esphome-econet) reads the RJ11
  diagnostics port locally (more reliable, needs ESP hardware — out of scope for a Node bridge).
- **Monitor:** tank/water temperature, operating mode (heat-pump / electric / hybrid / off), power/energy where exposed.
- **Control (DR):** setpoint, operating mode, and **enable/disable** — i.e. shed the water-heater load during events.
- **Effort: Medium.** Good DR fit via the cloud API.

### Eguana — home batteries (blocked)

- **Finding:** Eguana's Evolve cloud (Engage app / Evolve Hub) is for owners, utilities, and partners; **no public or
  community third-party API** was found. Utility/partner fleet access exists but isn't a consumer API.
- **Recommendation:** **defer** — revisit only if Eguana exposes an API or partner credentials are provided. Don't ship
  a stub.

## Build order (for the implementation PR)

1. **Sinopé/Neviweb** — 5 of the requested devices in one adapter; strong monitor **and** control. Biggest win.
2. **Wallbox** — clean documented API with real curtailment (pause/resume/set-current).
3. **Emporia chargers** — cheap; extends the existing Emporia adapter/auth.
4. **Rheem EcoNet** — water-heater load shed.
5. **ChargePoint** — reverse-engineered, account-based; slightly more fragile.
6. **SolarEdge** — battery monitoring (read-only; mind the 300/day limit).
7. **Eguana** — deferred (no API).

## Cross-cutting work this batch needs

- **OAuth2 / token store** (already in the backlog) — Wallbox (bearer refresh), ChargePoint (session), Emporia
  (Cognito), Rheem (account); generalize `src/adapters/mysa/session.ts`.
- **Climate + Water-heater + Switch + Number mappers** — thermostats reuse the `Climate` entity; Calypso/Rheem map to a
  `water_heater`-style climate or temperature `Number` + mode `Select` + on/off `Switch`; chargers expose a charge-rate
  `Number` + pause/resume `Switch`. All gated by the existing `OutputPolicy` (energy-only suppresses the control + the
  non-energy telemetry).
- **Rate-limit-aware polling** — SolarEdge (300/day) and Daikin-style caps need a configurable, slow poll.
- **Seasonal note (documentation only, per decision):** the thermostats are flagged "winter season only" by the program.
  This is **program context, not enforced** by the bridge — adapters run whenever configured. Documented here and in the
  README so operators know the program's intent.
