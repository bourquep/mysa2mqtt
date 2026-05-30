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
import { EnergyAccumulator } from './accumulator';

const HOUR = 3_600_000;

describe('EnergyAccumulator', () => {
  it('starts at zero and the first sample contributes nothing', () => {
    const acc = new EnergyAccumulator();
    expect(acc.kwh).toBe(0);
    expect(acc.addSample(1000, 0)).toBe(0);
  });

  it('integrates constant power over time (1000 W for 1 h = 1 kWh)', () => {
    const acc = new EnergyAccumulator();
    acc.addSample(1000, 0);
    expect(acc.addSample(1000, HOUR)).toBeCloseTo(1, 9);
    expect(acc.addSample(1000, 2 * HOUR)).toBeCloseTo(2, 9);
  });

  it('applies the previous reading across each interval (left Riemann sum)', () => {
    const acc = new EnergyAccumulator();
    acc.addSample(1000, 0); // 1000 W held for the first hour
    acc.addSample(2000, HOUR); // -> +1 kWh; now 2000 W held for the next hour
    expect(acc.kwh).toBeCloseTo(1, 9);
    acc.addSample(0, 2 * HOUR); // -> +2 kWh
    expect(acc.kwh).toBeCloseTo(3, 9);
  });

  it('handles half-hour intervals', () => {
    const acc = new EnergyAccumulator();
    acc.addSample(2000, 0);
    expect(acc.addSample(2000, HOUR / 2)).toBeCloseTo(1, 9); // 2000 W * 0.5 h = 1 kWh
  });

  it('ignores out-of-order or duplicate timestamps', () => {
    const acc = new EnergyAccumulator();
    acc.addSample(1000, HOUR);
    expect(acc.addSample(1000, HOUR)).toBe(0); // same timestamp -> no integration
    expect(acc.addSample(1000, HOUR - 1)).toBe(0); // earlier timestamp -> no integration
  });

  it('contributes nothing while power is zero', () => {
    const acc = new EnergyAccumulator();
    acc.addSample(0, 0);
    expect(acc.addSample(500, HOUR)).toBe(0); // previous reading was 0 W
    expect(acc.addSample(500, 2 * HOUR)).toBeCloseTo(0.5, 9); // now 500 W held for an hour
  });
});
