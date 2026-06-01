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
import { normalizeGen1Plug, normalizeGen2Switch } from './readings';

describe('normalizeGen2Switch', () => {
  it('maps a Gen2 Switch.GetStatus payload and converts energy Wh→kWh', () => {
    const reading = normalizeGen2Switch({
      output: true,
      apower: 123.4,
      voltage: 121,
      current: 1.02,
      aenergy: { total: 2500 },
      temperature: { tC: 38.2 }
    });
    expect(reading.output).toBe(true);
    expect(reading.powerWatts).toBe(123.4);
    expect(reading.voltage).toBe(121);
    expect(reading.currentAmps).toBe(1.02);
    expect(reading.totalEnergyKwh).toBe(2.5);
    expect(reading.temperatureC).toBe(38.2);
  });

  it('handles an off plug and missing fields', () => {
    const reading = normalizeGen2Switch({ output: false });
    expect(reading.output).toBe(false);
    expect(reading.powerWatts).toBeUndefined();
    expect(reading.totalEnergyKwh).toBeUndefined();
  });

  it('leaves output undefined when not a boolean', () => {
    expect(normalizeGen2Switch({}).output).toBeUndefined();
  });
});

describe('normalizeGen1Plug', () => {
  it('maps relay/meter and converts watt-minutes→kWh', () => {
    // 60000 Wmin = 1 kWh.
    const reading = normalizeGen1Plug({
      relays: [{ ison: true }],
      meters: [{ power: 60, total: 120000, voltage: 120 }]
    });
    expect(reading.output).toBe(true);
    expect(reading.powerWatts).toBe(60);
    expect(reading.voltage).toBe(120);
    expect(reading.totalEnergyKwh).toBe(2); // 120000 / 60000
  });

  it('reads temperature from tmp.tC or the legacy temperature field', () => {
    expect(normalizeGen1Plug({ tmp: { tC: 41 } }).temperatureC).toBe(41);
    expect(normalizeGen1Plug({ temperature: 39 }).temperatureC).toBe(39);
  });

  it('handles missing relays/meters', () => {
    const reading = normalizeGen1Plug({});
    expect(reading.output).toBeUndefined();
    expect(reading.powerWatts).toBeUndefined();
    expect(reading.totalEnergyKwh).toBeUndefined();
  });
});
