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
 * Pure helpers for parsing Tasmota MQTT payloads into a Home-Assistant-ready shape.
 *
 * Tasmota energy plugs publish periodic JSON to `tele/<topic>/SENSOR` containing an `ENERGY` object, e.g. `{ "ENERGY":
 * { "Power": 73, "Voltage": 121, "Current": 0.6, "Total": 12.345, "ApparentPower": 80, "Factor": 0.91 } }`, and relay
 * state to `tele/<topic>/STATE` / `stat/<topic>/RESULT` as `{ "POWER": "ON" }` (or `POWER1`, …). Power is in watts,
 * voltage in volts, current in amps, and `Total` is cumulative energy in **kWh**.
 *
 * Everything is treated defensively: missing or non-numeric fields become `undefined` rather than throwing.
 */

/** A normalized reading parsed from Tasmota telemetry. */
export interface TasmotaReading {
  /** Active power, in watts. */
  powerWatts?: number;
  /** Voltage, in volts. */
  voltage?: number;
  /** Current, in amperes. */
  currentAmps?: number;
  /** Cumulative energy, in kWh (Tasmota `ENERGY.Total` is already kWh). */
  totalEnergyKwh?: number;
  /** Apparent power, in VA. */
  apparentPowerVa?: number;
  /** Power factor (0–1). */
  powerFactor?: number;
  /** Relay output state (true = on), if present in the payload. */
  output?: boolean;
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
 * Extracts the first `POWER`-like relay key (`POWER`, `POWER1`, …) from a Tasmota object as a boolean.
 *
 * @param obj - The parsed payload object.
 * @returns `true`/`false` for a recognized on/off value, or `undefined`.
 */
function extractPower(obj: Record<string, unknown>): boolean | undefined {
  const key = Object.keys(obj).find((k) => /^POWER\d*$/.test(k));
  if (key == null) {
    return undefined;
  }
  const value = obj[key];
  if (value === 'ON' || value === true) {
    return true;
  }
  if (value === 'OFF' || value === false) {
    return false;
  }
  return undefined;
}

/**
 * Parses a Tasmota MQTT payload (from `SENSOR`, `STATE`, or `RESULT`) into a {@link TasmotaReading}.
 *
 * Accepts either a raw JSON string or an already-parsed object. Reads the `ENERGY` block for electrical values and any
 * `POWER`/`POWERn` key for relay state. Returns an empty reading for malformed JSON.
 *
 * @param payload - The raw MQTT payload (JSON string or object).
 * @returns The parsed reading.
 */
export function parseTasmotaPayload(payload: string | object): TasmotaReading {
  let obj: Record<string, unknown>;
  if (typeof payload === 'string') {
    try {
      obj = JSON.parse(payload) as Record<string, unknown>;
    } catch {
      return {};
    }
  } else {
    obj = payload as Record<string, unknown>;
  }

  if (obj == null || typeof obj !== 'object') {
    return {};
  }

  const energy = (obj.ENERGY ?? {}) as Record<string, unknown>;

  return {
    powerWatts: num(energy.Power),
    voltage: num(energy.Voltage),
    currentAmps: num(energy.Current),
    totalEnergyKwh: num(energy.Total),
    apparentPowerVa: num(energy.ApparentPower),
    powerFactor: num(energy.Factor),
    output: extractPower(obj)
  };
}

/** MQTT topics derived from a Tasmota device topic, used to subscribe and command. */
export interface TasmotaTopics {
  /** `tele/<topic>/SENSOR` — periodic energy telemetry. */
  sensor: string;
  /** `tele/<topic>/STATE` — periodic relay/state telemetry. */
  state: string;
  /** `stat/<topic>/RESULT` — command results (incl. relay changes). */
  result: string;
  /** `cmnd/<topic>/POWER` — relay command topic. */
  command: string;
}

/**
 * Builds the standard Tasmota MQTT topics for a device topic.
 *
 * @param deviceTopic - The Tasmota device topic (its `%topic%`, e.g. `tasmota_plug`).
 * @returns The derived {@link TasmotaTopics}.
 */
export function tasmotaTopics(deviceTopic: string): TasmotaTopics {
  const topic = deviceTopic.replace(/^\/+|\/+$/g, '');
  return {
    sensor: `tele/${topic}/SENSOR`,
    state: `tele/${topic}/STATE`,
    result: `stat/${topic}/RESULT`,
    command: `cmnd/${topic}/POWER`
  };
}
