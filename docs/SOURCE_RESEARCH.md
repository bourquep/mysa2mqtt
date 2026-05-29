# Source category research: thermostats, HVAC, EV chargers

This explores the top devices in three categories the project could bridge next, and — crucially — whether each can be
**incorporated** as a `SourceAdapter` (see `docs/GENERAL_BRIDGE.md`). The deciding factors for this codebase are:

1. **Is there an API we can actually get access to?** (Some vendors have closed registration.)
2. **Local or cloud?** Local is lower-latency and outage-proof; cloud needs OAuth2 + token refresh.
3. **Is there a usable Node/TypeScript client**, or do we implement the HTTP ourselves?
4. **Auth model** — API key (easy) vs OAuth2 (needs a token store) vs per-device local pairing.
5. **CI-testable** — anything HTTP/MQTT-based is testable with a mocked client, like the Mysa adapter.

> Status: **research only.** Nothing below is implemented yet. Links are to the relevant APIs/libraries.

## Category 1 — Smart thermostats

| Device                        | API                                                                     | Local? | Node lib                 | Auth            | Incorporate?                                                                                                       |
| ----------------------------- | ----------------------------------------------------------------------- | ------ | ------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Ecobee**                    | Official REST                                                           | Cloud  | community wrappers       | OAuth2          | ⛔ **Blocked** — Ecobee **stopped issuing API keys / dev accounts** (late 2024). Can't onboard new integrations.   |
| **Honeywell / Resideo Lyric** | [Resideo developer API](https://developer.honeywellhome.com/lyric/apis) | Cloud  | implement HTTP ourselves | OAuth2          | ✅ Open developer portal; documented thermostat get/set. Some users report onboarding friction. Good candidate.    |
| **Google Nest**               | Smart Device Management (SDM)                                           | Cloud  | implement HTTP ourselves | OAuth2 (Google) | ⚠️ Works, but **US$5 one-time dev fee** + Google Cloud project + strict verification. High friction for end users. |
| **Tado**                      | Unofficial REST (`my.tado.com`)                                         | Cloud  | community libs           | OAuth2          | ⚠️ Unofficial but stable and widely used; possible.                                                                |

**Verdict:** **Resideo/Honeywell Lyric** is the most incorporable thermostat (open portal, documented OAuth2 REST,
reuses our `Climate` entity). Ecobee — despite being a top pick technically — is **off the table for new integrations**.
Nest is feasible but the per-user Google Cloud setup is a poor UX.

## Category 2 — HVAC (mini-split heat pumps / AC)

This is the closest category to Mysa's existing AC support and reuses the `Climate` + fan-mode work already done.

| Ecosystem                       | API                                                                     | Local?    | Node lib                                                                                                                                               | Auth            | Incorporate?                                                                                               |
| ------------------------------- | ----------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- | ---------------------------------------------------------------------------------------------------------- |
| **Sensibo** (add-on controller) | [Official REST API](https://support.sensibo.com/api/)                   | Cloud     | implement HTTP (official Python exists; REST is simple)                                                                                                | **API key**     | ✅ **Best fit.** Clean documented REST, simple API-key auth, vendor-blessed. Controls _any_ IR mini-split. |
| **Mitsubishi (MELCloud)**       | MELCloud cloud API                                                      | Cloud     | [`melcloud-api`](https://github.com/OlivierZal/melcloud-api) (typed TS, TSDoc, rate-aware)                                                             | user/pass→token | ✅ Strong: a maintained, fully-typed TS client already exists.                                             |
| **Daikin (Onecta)**             | [Official Onecta API](https://www.daikinone.com/openapi/documentation/) | Cloud     | [`daikin-controller-cloud`](https://github.com/Apollon77/daikin-controller-cloud), [`node-daikin-onecta`](https://github.com/ptz0n/node-daikin-onecta) | OAuth2 (OIDC)   | ⚠️ Good libs, but **200 requests/day** rate limit forces careful polling design.                           |
| **LG ThinQ / others**           | Vendor cloud                                                            | Cloud     | varies                                                                                                                                                 | OAuth2          | ⚠️ Possible but messier; lower priority.                                                                   |
| **Mitsubishi CN105 (direct)**   | Serial via [`SwiCago/HeatPump`](https://github.com/SwiCago/HeatPump)    | **Local** | — (firmware, not Node)                                                                                                                                 | —               | ⛔ Hardware/firmware route (ESPHome); out of scope for a Node bridge.                                      |

**Verdict:** **Sensibo** (simplest, API-key, vendor-supported) and **MELCloud via `melcloud-api`** (best ready-made
typed client) are the two strongest HVAC adapters, both reusing the existing `Climate` entity. Daikin Onecta is viable
if we respect its tight daily quota.

## Category 3 — EV chargers

Chargers split sharply into **local-API** (LAN, outage-proof) and **cloud-only** (OAuth2). There's also a **unified**
option (Enode) and a **standard protocol** (OCPP) worth noting.

| Charger                  | API                                        | Local?            | Node/integration                                                | Auth           | Incorporate?                                                                                                      |
| ------------------------ | ------------------------------------------ | ----------------- | --------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------- |
| **OpenEVSE**             | Native **MQTT** + HTTP                     | **Local**         | speaks MQTT directly                                            | none/local     | ✅ **Easiest possible.** It already publishes MQTT — an adapter mostly maps its topics into HA discovery.         |
| **go-e Charger**         | **Local** HTTP API                         | **Local**         | implement HTTP ourselves                                        | local key      | ✅ Clean local REST; good fit, fully testable.                                                                    |
| **Easee**                | Cloud REST (advanced; charge-rate control) | Cloud             | [`pyeasee`](https://github.com/nordicopen/pyeasee) (Python ref) | OAuth2         | ✅ Best **cloud** charger API (most capable). Implement HTTP in TS using pyeasee as reference.                    |
| **Zaptec**               | Cloud REST                                 | Cloud             | implement HTTP ourselves                                        | OAuth2         | ✅ Improved a lot; near-Easee, lacks charge-rate control.                                                         |
| **Wallbox**              | Cloud REST (+ unofficial local)            | Cloud             | implement HTTP ourselves                                        | OAuth2         | ⚠️ Scheduling works; **no charge-rate control** via official API.                                                 |
| **Tesla Wall Connector** | Local HTTP (Gen 3) / Tesla cloud           | **Local** (Gen 3) | implement HTTP ourselves                                        | none (local)   | ✅ Gen 3 exposes a local JSON endpoint (power/state) — read-only but easy.                                        |
| **Any OCPP charger**     | **OCPP 1.6/2.0.1** (WebSocket)             | Local/cloud       | act as an OCPP central system                                   | per-config     | ⭐ **Highest leverage:** one OCPP server speaks to _many_ vendors, but it's a substantial protocol to implement.  |
| _(Enode)_                | **Unified** cloud API across brands        | Cloud             | implement HTTP ourselves                                        | OAuth2 (Enode) | ➖ Commercial aggregator; adds a paid third party. Not ideal for an OSS bridge, but the fastest multi-brand path. |

**Verdict:** Start with a **local** charger — **OpenEVSE** (already MQTT-native) or **go-e** (clean local REST) — for an
outage-proof, fully-testable first adapter. **Easee** is the best cloud charger if a cloud one is wanted. **OCPP** is
the strategic long game (vendor-agnostic) but is its own sizable project.

### Canadian market — popularity vs. effort

The brands above skew European. In **Canada**, the popular home Level 2 chargers are different: **Tesla** and
**ChargePoint** dominate installs (~half of recent-EV owners), and two **Canadian-made** brands — **Grizzl-E** (United
Chargers, Kitchener ON) and **FLO** (Quebec) — are very common, alongside **Wallbox**. Effort to incorporate each:

| Charger (popularity in Canada)                | Integration path                                                                          | Auth / locality       | Effort                | Notes                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tesla Wall Connector** (very high)          | **Local** HTTP `GET http://<ip>/api/1/vitals` (+ `/lifetime`)                             | **None** (LAN)        | 🟢 **Low**            | Gen 3 Wi-Fi units serve unauthenticated JSON (`vehicle_connected`, `session_s`, currents/voltages, `grid_v`). **Read/monitor only** — no start/stop/charge-rate. Reference: [`tesla-wall-connector`](https://pypi.org/project/tesla-wall-connector/). Note a known timeout-after-prolonged-polling quirk to handle.                                                                     |
| **Grizzl-E** (very high, 🇨🇦)                  | **Local** unauthenticated JSON web interface (Connect/Ultimate Wi-Fi lines); or **OCPP**  | None (LAN) / OCPP     | 🟢🟡 **Low–Med**      | The local JSON route is easy (cf. [`mclare/grizzl_e-for-HA`](https://github.com/mclare/grizzl_e-for-HA)). The OCPP route unlocks control but Grizzl-E's firmware has **OCPP-compliance defects** (invalid JSON to some messages) needing workarounds (cf. [`stefanthoss/ocpp-grizzl-e`](https://github.com/stefanthoss/ocpp-grizzl-e)). Not all models (no "Grizzl-E Club"/commercial). |
| **ChargePoint Home Flex** (very high)         | **Cloud** polling with ChargePoint account                                                | Account creds (cloud) | 🟡 **Med**            | No official public API; community libs reverse-engineer the app login (cf. [`mbillow/ha-chargepoint`](https://github.com/mbillow/ha-chargepoint)). Monitor + some control. Fragile to vendor changes.                                                                                                                                                                                   |
| **FLO Home X5 / G5** (high, 🇨🇦)               | **Cloud only** — FLO account/app; no documented consumer API (only OpenADR for utilities) | Cloud, undocumented   | 🔴 **High / blocked** | No public or community consumer API found; everything goes through FLO's cloud. Would require reverse-engineering the app with no reference implementation. Avoid for now.                                                                                                                                                                                                              |
| **Wallbox Pulsar (Plus/Max)** (medium)        | **Cloud** REST (official) + unofficial local                                              | OAuth2 (cloud)        | 🟡 **Med**            | Scheduling/monitor work; **no charge-rate control** via official API. Same effort as the EU table above.                                                                                                                                                                                                                                                                                |
| **Any OCPP charger** (incl. Grizzl-E, others) | Act as an **OCPP 1.6** central system over WebSocket                                      | per-charger config    | 🔴 **High**           | Vendor-agnostic and powerful (covers many Canadian units in one shot), but implementing/​testing an OCPP server is a project in itself. Strategic, not a first step.                                                                                                                                                                                                                    |

**Canadian-market recommendation (by effort):**

1. 🟢 **Tesla Wall Connector** — lowest effort _and_ highest install base; pure local JSON, fully mock-testable. Ships
   as a **monitoring** adapter (power/energy/session/vehicle-connected) — honest about no control.
2. 🟢 **Grizzl-E (local JSON)** — popular Canadian brand, easy local read path; add OCPP control later as a separate
   effort.
3. 🟡 **ChargePoint Home Flex** — high install base but cloud-only via reverse-engineered login; medium effort and
   maintenance risk.
4. 🔴 **FLO** — popular but effectively **blocked** (cloud-only, no API); revisit only if FLO publishes one or someone
   reverse-engineers it.

> A pragmatic plan: ship a small **`Sensor`-only Tesla Wall Connector adapter** first (local, easy, high coverage), then
> a **Grizzl-E** local adapter, and treat **OCPP** as the eventual control-capable, multi-brand layer that also serves
> Grizzl-E and others. Control (start/stop, charge-rate) realistically arrives via OCPP, not the per-vendor local
> read-only endpoints.

## Cross-cutting recommendation

Ranked first picks across the three categories, by incorporability for _this_ codebase:

1. **Sensibo (HVAC)** — simplest auth (API key), official REST, reuses the `Climate` entity. Lowest-risk new adapter.
2. **OpenEVSE (EV charger)** — already speaks MQTT; an adapter is mostly topic-mapping + HA discovery. Local & testable.
3. **MELCloud (HVAC)** — a maintained typed TS client (`melcloud-api`) does the heavy lifting; broad Mitsubishi base.
4. **Resideo/Honeywell Lyric (thermostat)** — the one top-tier thermostat with an open, documented OAuth2 API.

### Shared groundwork (pays off across all of the above)

- **OAuth2 token store** (authorize once → persist → refresh): needed by Lyric, Daikin, Easee, Zaptec, Wallbox.
  Generalize `src/adapters/mysa/session.ts`.
- **`Climate` mapping helper**: thermostats + HVAC all map to the same Home Assistant `Climate` entity already wired for
  Mysa — factor the mode/fan/setpoint mapping into a reusable unit.
- **New `mqtt2ha` entity types**: EV chargers want `Sensor` (power/energy/session) + `Switch`/`Number` (start-stop,
  charge-rate). `mqtt2ha` already provides these.
- **Per-adapter enable flags** in `src/options.ts`, exactly like `--system-sensors` / `--mysa-*`.

### What is _not_ worth building here

- **Ecobee** — API registration is closed; can't onboard.
- **Direct-serial heat-pump control (CN105)** — that's an ESPHome/firmware niche, not a Node bridge.
- **Re-implementing Enode** — it's a commercial aggregator; depending on it undercuts a self-hosted OSS bridge.
