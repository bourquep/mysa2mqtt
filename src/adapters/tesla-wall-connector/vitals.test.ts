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

import { describe, expect, it } from 'vitest';
import { estimatePowerWatts, normalizeWallConnectorState } from './vitals';

describe('estimatePowerWatts', () => {
  it('sums per-phase voltage × current', () => {
    expect(estimatePowerWatts({ voltageA_v: 240, currentA_a: 10 })).toBe(2400);
    expect(
      estimatePowerWatts({
        voltageA_v: 120,
        currentA_a: 10,
        voltageB_v: 120,
        currentB_a: 5
      })
    ).toBe(1800);
  });

  it('ignores phases missing a voltage or current', () => {
    expect(estimatePowerWatts({ voltageA_v: 240, currentA_a: 10, currentB_a: 5 })).toBe(2400);
  });

  it('returns undefined when no phase has both values', () => {
    expect(estimatePowerWatts({})).toBeUndefined();
    expect(estimatePowerWatts({ voltageA_v: 240 })).toBeUndefined();
  });
});

describe('normalizeWallConnectorState', () => {
  it('maps a typical charging vitals payload', () => {
    const state = normalizeWallConnectorState({
      contactor_closed: true,
      vehicle_connected: true,
      session_s: 1234,
      grid_v: 241,
      grid_hz: 60,
      voltageA_v: 240,
      currentA_a: 24,
      handle_temp_c: 31.5
    });

    expect(state.charging).toBe(true);
    expect(state.vehicleConnected).toBe(true);
    expect(state.sessionSeconds).toBe(1234);
    expect(state.gridVoltage).toBe(241);
    expect(state.gridFrequency).toBe(60);
    expect(state.totalCurrent).toBe(24);
    expect(state.power).toBe(5760);
    expect(state.handleTemperature).toBe(31.5);
  });

  it('converts lifetime energy from Wh to kWh', () => {
    const state = normalizeWallConnectorState({}, { energy_wh: 12_500 });
    expect(state.lifetimeEnergyKwh).toBe(12.5);
  });

  it('sums total current across phases', () => {
    const state = normalizeWallConnectorState({ currentA_a: 10, currentB_a: 8, currentC_a: 6 });
    expect(state.totalCurrent).toBe(24);
  });

  it('leaves booleans undefined when the API omits them (does not coerce)', () => {
    const state = normalizeWallConnectorState({});
    expect(state.vehicleConnected).toBeUndefined();
    expect(state.charging).toBeUndefined();
    expect(state.power).toBeUndefined();
    expect(state.lifetimeEnergyKwh).toBeUndefined();
  });

  it('ignores non-finite numeric fields', () => {
    const state = normalizeWallConnectorState({ grid_v: Number.NaN, session_s: 10 });
    expect(state.gridVoltage).toBeUndefined();
    expect(state.sessionSeconds).toBe(10);
  });

  it('treats an idle (unplugged) connector correctly', () => {
    const state = normalizeWallConnectorState({
      contactor_closed: false,
      vehicle_connected: false,
      session_s: 0
    });
    expect(state.charging).toBe(false);
    expect(state.vehicleConnected).toBe(false);
    expect(state.sessionSeconds).toBe(0);
  });
});
