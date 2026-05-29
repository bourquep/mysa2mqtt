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
 * Pure helpers for normalizing Shelly energy-meter readings into a Home-Assistant-ready shape.
 *
 * Shelly exposes three relevant report shapes, all handled here:
 *
 * - **Gen2 three-phase** (`Pro 3EM`): `EM.GetStatus` (`a_act_power`, `total_act_power`, `a_voltage`, …) plus
 *   `EMData.GetStatus` for cumulative energy (`total_act`, `a_total_act_energy`, … in Wh).
 * - **Gen2 single-phase** (`EM1`): `EM1.GetStatus` (`act_power`, `voltage`, `current`, …) plus `EM1Data.GetStatus`
 *   (`total_act_energy` in Wh).
 * - **Gen1** (`Shelly EM` / `3EM`): `GET /status` with an `emeters` array (`power`, `voltage`, `total` in Wh).
 *
 * Everything is treated defensively: missing or non-numeric fields become `undefined` rather than throwing.
 */

/** A normalized, Home-Assistant-ready snapshot of an energy meter. */
export interface EnergyMeterReading {
  /** Total active power across all phases/channels, in watts. */
  totalPowerWatts?: number;
  /** Total current across all phases/channels, in amperes. */
  totalCurrentAmps?: number;
  /** Representative voltage, in volts (first available phase/channel). */
  voltage?: number;
  /** Cumulative consumed active energy, in kWh (converted from the API's watt-hours). */
  totalEnergyKwh?: number;
  /** Cumulative returned (exported) active energy, in kWh, if reported. */
  totalReturnedEnergyKwh?: number;
  /** Per-phase/per-channel active power, in watts. */
  channelPowerWatts: number[];
}

/** A Gen2 `EM.GetStatus` (three-phase) payload subset. */
export interface ShellyGen2EmStatus {
  total_act_power?: number;
  total_current?: number;
  a_act_power?: number;
  b_act_power?: number;
  c_act_power?: number;
  a_voltage?: number;
  b_voltage?: number;
  c_voltage?: number;
}

/** A Gen2 `EMData.GetStatus` (three-phase energy) payload subset. */
export interface ShellyGen2EmDataStatus {
  total_act?: number;
  total_act_ret?: number;
}

/** A Gen2 `EM1.GetStatus` (single-phase) payload subset. */
export interface ShellyGen2Em1Status {
  act_power?: number;
  current?: number;
  voltage?: number;
}

/** A Gen2 `EM1Data.GetStatus` (single-phase energy) payload subset. */
export interface ShellyGen2Em1DataStatus {
  total_act_energy?: number;
  total_act_ret_energy?: number;
}

/** A Gen1 `/status` payload subset (the `emeters` array). */
export interface ShellyGen1Status {
  emeters?: { power?: number; voltage?: number; current?: number; total?: number; total_returned?: number }[];
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
 * Sums the defined, finite operands; returns `undefined` if none are usable.
 *
 * @param values - The values to sum.
 * @returns The sum, or `undefined`.
 */
function sum(...values: (number | undefined)[]): number | undefined {
  const finite = values.filter((value): value is number => value != null && Number.isFinite(value));
  return finite.length > 0 ? finite.reduce((total, value) => total + value, 0) : undefined;
}

/** Converts watt-hours to kWh, preserving `undefined`. */
function whToKwh(wh: number | undefined): number | undefined {
  return wh != null ? wh / 1000 : undefined;
}

/**
 * Normalizes a Gen2 three-phase Shelly (`EM` + optional `EMData`) into an {@link EnergyMeterReading}.
 *
 * @param em - The `EM.GetStatus` payload.
 * @param emData - The `EMData.GetStatus` payload, if available.
 * @returns The normalized reading.
 */
export function normalizeGen2Em(em: ShellyGen2EmStatus, emData?: ShellyGen2EmDataStatus): EnergyMeterReading {
  const channelPowerWatts = [num(em.a_act_power), num(em.b_act_power), num(em.c_act_power)].filter(
    (value): value is number => value != null
  );

  return {
    totalPowerWatts: num(em.total_act_power) ?? sum(em.a_act_power, em.b_act_power, em.c_act_power),
    totalCurrentAmps: num(em.total_current),
    voltage: num(em.a_voltage) ?? num(em.b_voltage) ?? num(em.c_voltage),
    totalEnergyKwh: whToKwh(num(emData?.total_act)),
    totalReturnedEnergyKwh: whToKwh(num(emData?.total_act_ret)),
    channelPowerWatts
  };
}

/**
 * Normalizes a Gen2 single-phase Shelly (`EM1` + optional `EM1Data`) into an {@link EnergyMeterReading}.
 *
 * @param em1 - The `EM1.GetStatus` payload.
 * @param em1Data - The `EM1Data.GetStatus` payload, if available.
 * @returns The normalized reading.
 */
export function normalizeGen2Em1(em1: ShellyGen2Em1Status, em1Data?: ShellyGen2Em1DataStatus): EnergyMeterReading {
  const power = num(em1.act_power);

  return {
    totalPowerWatts: power,
    totalCurrentAmps: num(em1.current),
    voltage: num(em1.voltage),
    totalEnergyKwh: whToKwh(num(em1Data?.total_act_energy)),
    totalReturnedEnergyKwh: whToKwh(num(em1Data?.total_act_ret_energy)),
    channelPowerWatts: power != null ? [power] : []
  };
}

/**
 * Normalizes a Gen1 Shelly `/status` payload (with an `emeters` array) into an {@link EnergyMeterReading}.
 *
 * @param status - The `/status` payload.
 * @returns The normalized reading.
 */
export function normalizeGen1(status: ShellyGen1Status): EnergyMeterReading {
  const meters = Array.isArray(status.emeters) ? status.emeters : [];

  const channelPowerWatts = meters.map((meter) => num(meter.power)).filter((value): value is number => value != null);

  return {
    totalPowerWatts: sum(...meters.map((meter) => num(meter.power))),
    totalCurrentAmps: sum(...meters.map((meter) => num(meter.current))),
    voltage: meters.map((meter) => num(meter.voltage)).find((value) => value != null),
    totalEnergyKwh: whToKwh(sum(...meters.map((meter) => num(meter.total)))),
    totalReturnedEnergyKwh: whToKwh(sum(...meters.map((meter) => num(meter.total_returned)))),
    channelPowerWatts
  };
}
