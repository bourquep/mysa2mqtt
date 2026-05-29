/*
mysa2mqtt
Copyright (C) 2025 Pascal Bourque

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

/**
 * Pure helpers for the Tesla Wall Connector (Gen 3) local HTTP API.
 *
 * Gen 3 Wi-Fi Wall Connectors expose an **unauthenticated** JSON API on the local network, most usefully:
 *
 * - `GET http://<ip>/api/1/vitals` — live electrical and session state.
 * - `GET http://<ip>/api/1/lifetime` — cumulative energy and session counters.
 *
 * This is a **monitor-only** integration: the local API exposes no control (start/stop, charge-rate). Field names below
 * are the ones the firmware is observed to emit; all are treated as optional and validated, since the API is
 * undocumented.
 */

/** A subset of the `GET /api/1/vitals` response we map to Home Assistant. */
export interface TeslaWallConnectorVitals {
  /** Whether the internal contactor is closed (delivering power). */
  contactor_closed?: boolean;
  /** Whether a vehicle is plugged in. */
  vehicle_connected?: boolean;
  /** Elapsed time of the current session, in seconds. */
  session_s?: number;
  /** Grid voltage, in volts. */
  grid_v?: number;
  /** Grid frequency, in hertz. */
  grid_hz?: number;
  /** Per-phase RMS currents, in amperes. */
  currentA_a?: number;
  currentB_a?: number;
  currentC_a?: number;
  /** Per-phase voltages, in volts. */
  voltageA_v?: number;
  voltageB_v?: number;
  voltageC_v?: number;
  /** Handle/PCB temperatures, in °C. */
  handle_temp_c?: number;
  pcba_temp_c?: number;
  /** Numeric EVSE state code. */
  evse_state?: number;
}

/** A subset of the `GET /api/1/lifetime` response we map to Home Assistant. */
export interface TeslaWallConnectorLifetime {
  /** Lifetime energy delivered, in watt-hours. */
  energy_wh?: number;
  /** Lifetime number of charging sessions. */
  charge_starts?: number;
  /** Lifetime connector uptime, in seconds. */
  contactor_cycles?: number;
  uptime_s?: number;
}

/** Normalized, Home-Assistant-ready snapshot derived from the Tesla Wall Connector. */
export interface TeslaWallConnectorState {
  /** Whether a vehicle is connected. */
  vehicleConnected?: boolean;
  /** Whether the contactor is closed (actively delivering power). */
  charging?: boolean;
  /** Current session duration, in seconds. */
  sessionSeconds?: number;
  /** Grid voltage, in volts. */
  gridVoltage?: number;
  /** Grid frequency, in hertz. */
  gridFrequency?: number;
  /** Total instantaneous current across all phases, in amperes. */
  totalCurrent?: number;
  /** Estimated instantaneous power, in watts (sum of per-phase voltage × current). */
  power?: number;
  /** Handle temperature, in °C. */
  handleTemperature?: number;
  /** Lifetime energy delivered, in kWh (converted from the API's watt-hours). */
  lifetimeEnergyKwh?: number;
}

/**
 * Returns the value only if it is a finite number, otherwise `undefined`.
 *
 * @param value - The value to check.
 * @returns The finite number, or `undefined`.
 */
function finiteOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Sums the defined, finite operands; returns `undefined` only if none are usable.
 *
 * @param values - The values to sum.
 * @returns The sum of the finite values, or `undefined` if there are none.
 */
function sumDefined(...values: (number | undefined)[]): number | undefined {
  const finite = values.filter((value): value is number => value != null && Number.isFinite(value));
  return finite.length > 0 ? finite.reduce((total, value) => total + value, 0) : undefined;
}

/**
 * Estimates instantaneous power from per-phase voltages and currents (`Σ Vᵢ × Iᵢ`).
 *
 * Phases with a missing voltage or current contribute nothing. Returns `undefined` if no phase has both.
 *
 * @param vitals - The vitals payload.
 * @returns Estimated power in watts, or `undefined`.
 */
export function estimatePowerWatts(vitals: TeslaWallConnectorVitals): number | undefined {
  const phases: [number | undefined, number | undefined][] = [
    [vitals.voltageA_v, vitals.currentA_a],
    [vitals.voltageB_v, vitals.currentB_a],
    [vitals.voltageC_v, vitals.currentC_a]
  ];

  const perPhase = phases.map(([v, a]) =>
    v != null && a != null && Number.isFinite(v) && Number.isFinite(a) ? v * a : undefined
  );

  return sumDefined(...perPhase);
}

/**
 * Normalizes the Wall Connector's `vitals` (and optional `lifetime`) payloads into a Home-Assistant-ready snapshot.
 *
 * Inputs are treated defensively: missing or non-numeric fields become `undefined` rather than throwing, because the
 * local API is undocumented and varies by firmware.
 *
 * @param vitals - The parsed `GET /api/1/vitals` payload.
 * @param lifetime - The parsed `GET /api/1/lifetime` payload, if available.
 * @returns The normalized {@link TeslaWallConnectorState}.
 */
export function normalizeWallConnectorState(
  vitals: TeslaWallConnectorVitals,
  lifetime?: TeslaWallConnectorLifetime
): TeslaWallConnectorState {
  const energyWh = lifetime ? finiteOrUndefined(lifetime.energy_wh) : undefined;

  return {
    vehicleConnected: typeof vitals.vehicle_connected === 'boolean' ? vitals.vehicle_connected : undefined,
    charging: typeof vitals.contactor_closed === 'boolean' ? vitals.contactor_closed : undefined,
    sessionSeconds: finiteOrUndefined(vitals.session_s),
    gridVoltage: finiteOrUndefined(vitals.grid_v),
    gridFrequency: finiteOrUndefined(vitals.grid_hz),
    totalCurrent: sumDefined(vitals.currentA_a, vitals.currentB_a, vitals.currentC_a),
    power: estimatePowerWatts(vitals),
    handleTemperature: finiteOrUndefined(vitals.handle_temp_c),
    lifetimeEnergyKwh: energyWh != null ? energyWh / 1000 : undefined
  };
}
