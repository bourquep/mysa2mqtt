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
import { normalizeGen1, normalizeGen2Em, normalizeGen2Em1 } from './readings';

describe('normalizeGen2Em (three-phase)', () => {
  it('maps totals, picks a voltage, and converts energy Wh→kWh', () => {
    const reading = normalizeGen2Em(
      {
        total_act_power: 3300,
        total_current: 15,
        a_act_power: 1000,
        b_act_power: 1200,
        c_act_power: 1100,
        a_voltage: 240,
        b_voltage: 241,
        c_voltage: 239
      },
      { total_act: 12_500, total_act_ret: 500 }
    );

    expect(reading.totalPowerWatts).toBe(3300);
    expect(reading.totalCurrentAmps).toBe(15);
    expect(reading.voltage).toBe(240);
    expect(reading.totalEnergyKwh).toBe(12.5);
    expect(reading.totalReturnedEnergyKwh).toBe(0.5);
    expect(reading.channelPowerWatts).toEqual([1000, 1200, 1100]);
  });

  it('falls back to summing phases when total_act_power is absent', () => {
    const reading = normalizeGen2Em({ a_act_power: 100, b_act_power: 200, c_act_power: 300 });
    expect(reading.totalPowerWatts).toBe(600);
  });

  it('works without EMData (no energy totals)', () => {
    const reading = normalizeGen2Em({ total_act_power: 500, a_voltage: 120 });
    expect(reading.totalPowerWatts).toBe(500);
    expect(reading.totalEnergyKwh).toBeUndefined();
  });
});

describe('normalizeGen2Em1 (single-phase)', () => {
  it('maps a single channel and converts energy', () => {
    const reading = normalizeGen2Em1({ act_power: 750, current: 6.2, voltage: 121 }, { total_act_energy: 4200 });
    expect(reading.totalPowerWatts).toBe(750);
    expect(reading.totalCurrentAmps).toBe(6.2);
    expect(reading.voltage).toBe(121);
    expect(reading.totalEnergyKwh).toBe(4.2);
    expect(reading.channelPowerWatts).toEqual([750]);
  });

  it('omits the channel when no power is reported', () => {
    const reading = normalizeGen2Em1({ voltage: 120 });
    expect(reading.channelPowerWatts).toEqual([]);
    expect(reading.totalPowerWatts).toBeUndefined();
  });
});

describe('normalizeGen1 (/status emeters)', () => {
  it('sums power/current/energy across emeters and picks the first voltage', () => {
    const reading = normalizeGen1({
      emeters: [
        { power: 800, voltage: 120, current: 6.6, total: 5000, total_returned: 100 },
        { power: 1200, voltage: 121, current: 10, total: 7000, total_returned: 0 }
      ]
    });

    expect(reading.totalPowerWatts).toBe(2000);
    expect(reading.totalCurrentAmps).toBeCloseTo(16.6, 5);
    expect(reading.voltage).toBe(120);
    expect(reading.totalEnergyKwh).toBe(12);
    expect(reading.totalReturnedEnergyKwh).toBe(0.1);
    expect(reading.channelPowerWatts).toEqual([800, 1200]);
  });

  it('handles a missing or empty emeters array', () => {
    expect(normalizeGen1({}).totalPowerWatts).toBeUndefined();
    expect(normalizeGen1({ emeters: [] }).channelPowerWatts).toEqual([]);
  });

  it('ignores non-finite fields', () => {
    const reading = normalizeGen1({ emeters: [{ power: Number.NaN, voltage: 120, total: 1000 }] });
    expect(reading.totalPowerWatts).toBeUndefined();
    expect(reading.voltage).toBe(120);
    expect(reading.totalEnergyKwh).toBe(1);
  });
});
