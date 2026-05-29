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

import { DeviceType, deviceTypeFromModel } from './conversions';

/**
 * The physical family a Mysa device belongs to, parsed from its model identifier.
 *
 * - `'BB'` — electric baseboard / in-floor thermostats (model starts with `BB`).
 * - `'AC'` — mini-split heat pump / air conditioner controllers (model starts with `AC`).
 * - `'UNKNOWN'` — anything else (e.g. some in-floor units report a model this tool doesn't recognize); treated as a
 *   heat-only baseboard for safety.
 */
export type DeviceFamily = 'BB' | 'AC' | 'UNKNOWN';

/** Structured information parsed from a Mysa model identifier such as `BB-V2-1-L`. */
export interface ModelInfo {
  /** The original, unmodified model string. */
  raw: string;
  /** The physical device family. */
  family: DeviceFamily;
  /** Hardware generation parsed from a `Vn` segment (e.g. `2` for `BB-V2-1`), if present. */
  generation?: number;
  /** Whether this is a "Lite" variant (model ends with an `-L` segment), which has reduced sensing. */
  isLite: boolean;
}

/** The set of Home Assistant features a Mysa device should expose, derived from its model. */
export interface DeviceCapabilities {
  /** Whether the device behaves as an air conditioner (`'AC'`) or a heater (`'BB'`). */
  deviceType: DeviceType;
  /** Whether the device supports cooling modes (AC controllers only). */
  supportsCooling: boolean;
  /** Whether the device supports fan-speed control (AC controllers only). */
  supportsFan: boolean;
  /**
   * Whether the device can report power consumption.
   *
   * Baseboard thermostats measure current (V1) or estimate it from a duty cycle (V2). "Lite" units and AC controllers
   * (which are infrared blasters for third-party units and measure nothing) cannot, so no power sensor is created for
   * them.
   */
  reportsPower: boolean;
}

/**
 * Parses a Mysa model identifier into its constituent parts.
 *
 * @param model - The Mysa model string (e.g. `BB-V1-1`, `BB-V2-1-L`, `AC-V1-1`).
 * @returns The parsed {@link ModelInfo}.
 */
export function parseModel(model: string): ModelInfo {
  const raw = model ?? '';
  const tokens = raw
    .toUpperCase()
    .split('-')
    .filter((token) => token.length > 0);

  const family: DeviceFamily = tokens[0] === 'AC' ? 'AC' : tokens[0] === 'BB' ? 'BB' : 'UNKNOWN';

  let generation: number | undefined;
  for (const token of tokens) {
    const match = /^V(\d+)$/.exec(token);
    if (match) {
      generation = parseInt(match[1], 10);
      break;
    }
  }

  const isLite = tokens.includes('L');

  return { raw, family, generation, isLite };
}

/**
 * Determines which Home Assistant features a Mysa device should expose, based on its model.
 *
 * @param model - The Mysa model string.
 * @returns The {@link DeviceCapabilities} for the device.
 */
export function getDeviceCapabilities(model: string): DeviceCapabilities {
  const info = parseModel(model);
  // Reuse the existing AC-vs-heater detection so there is a single source of truth.
  const deviceType = deviceTypeFromModel(model);
  const isAC = deviceType === 'AC';

  return {
    deviceType,
    supportsCooling: isAC,
    supportsFan: isAC,
    reportsPower: !isAC && !info.isLite
  };
}
