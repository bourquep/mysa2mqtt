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
 * Pure helpers for normalizing Shelly **smart plug** readings (a metered relay) into a Home-Assistant-ready shape.
 *
 * Two report shapes are handled:
 *
 * - **Gen2** (`Plus Plug S`, `Plus 1PM`, `Pro 1PM`, …): `Switch.GetStatus` → `{ output: bool, apower: W, voltage: V,
 *   current: A, aenergy: { total: Wh }, temperature: { tC } }`.
 * - **Gen1** (`Shelly Plug S`, `Plug`, …): `GET /status` → `{ relays: [{ ison }], meters: [{ power, total }] }`, where
 *   Gen1 meter `total` is in **watt-minutes** (not Wh).
 *
 * Everything is treated defensively: missing or non-numeric fields become `undefined` rather than throwing.
 */

/** A normalized, Home-Assistant-ready snapshot of a metered smart plug. */
export interface PlugReading {
  /** Relay output state (true = on), if known. */
  output?: boolean;
  /** Active power, in watts. */
  powerWatts?: number;
  /** Voltage, in volts. */
  voltage?: number;
  /** Current, in amperes. */
  currentAmps?: number;
  /** Cumulative active energy, in kWh. */
  totalEnergyKwh?: number;
  /** Device temperature, in °C. */
  temperatureC?: number;
}

/** A Gen2 `Switch.GetStatus` payload subset. */
export interface ShellyGen2SwitchStatus {
  output?: boolean;
  apower?: number;
  voltage?: number;
  current?: number;
  aenergy?: { total?: number };
  temperature?: { tC?: number };
}

/** A Gen1 `/status` payload subset (relays + meters). */
export interface ShellyGen1PlugStatus {
  relays?: { ison?: boolean }[];
  meters?: { power?: number; total?: number; voltage?: number }[];
  temperature?: number;
  tmp?: { tC?: number };
}

/**
 * Returns the value only if it is a finite number, otherwise `undefined`.
 *
 * @param value - The value to check.
 * @returns The finite number, or `undefined`.
 */
function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Normalizes a Gen2 `Switch.GetStatus` payload into a {@link PlugReading}.
 *
 * @param status - The `Switch.GetStatus` payload.
 * @returns The normalized reading.
 */
export function normalizeGen2Switch(status: ShellyGen2SwitchStatus): PlugReading {
  const energyWh = num(status.aenergy?.total);
  return {
    output: typeof status.output === 'boolean' ? status.output : undefined,
    powerWatts: num(status.apower),
    voltage: num(status.voltage),
    currentAmps: num(status.current),
    totalEnergyKwh: energyWh != null ? energyWh / 1000 : undefined,
    temperatureC: num(status.temperature?.tC)
  };
}

/**
 * Normalizes a Gen1 plug `/status` payload into a {@link PlugReading}.
 *
 * Gen1 meter `total` is in **watt-minutes**, so it is converted to kWh via `/ 60000`.
 *
 * @param status - The `/status` payload.
 * @returns The normalized reading.
 */
export function normalizeGen1Plug(status: ShellyGen1PlugStatus): PlugReading {
  const relay = Array.isArray(status.relays) ? status.relays[0] : undefined;
  const meter = Array.isArray(status.meters) ? status.meters[0] : undefined;
  const wattMinutes = num(meter?.total);

  return {
    output: typeof relay?.ison === 'boolean' ? relay.ison : undefined,
    powerWatts: num(meter?.power),
    voltage: num(meter?.voltage),
    currentAmps: undefined,
    totalEnergyKwh: wattMinutes != null ? wattMinutes / 60000 : undefined,
    temperatureC: num(status.tmp?.tC) ?? num(status.temperature)
  };
}
