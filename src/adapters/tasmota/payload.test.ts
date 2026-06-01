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
import { parseTasmotaPayload, tasmotaTopics } from './payload';

describe('parseTasmotaPayload', () => {
  it('parses a SENSOR ENERGY payload (Total is already kWh)', () => {
    const reading = parseTasmotaPayload(
      JSON.stringify({
        Time: '2026-06-01T12:00:00',
        ENERGY: { Power: 73, Voltage: 121, Current: 0.604, Total: 12.345, ApparentPower: 80, Factor: 0.91 }
      })
    );
    expect(reading.powerWatts).toBe(73);
    expect(reading.voltage).toBe(121);
    expect(reading.currentAmps).toBe(0.604);
    expect(reading.totalEnergyKwh).toBe(12.345);
    expect(reading.apparentPowerVa).toBe(80);
    expect(reading.powerFactor).toBe(0.91);
  });

  it('parses relay state from POWER and POWERn keys', () => {
    expect(parseTasmotaPayload(JSON.stringify({ POWER: 'ON' })).output).toBe(true);
    expect(parseTasmotaPayload(JSON.stringify({ POWER: 'OFF' })).output).toBe(false);
    expect(parseTasmotaPayload(JSON.stringify({ POWER1: 'ON' })).output).toBe(true);
  });

  it('parses a STATE payload that mixes POWER with other fields', () => {
    const reading = parseTasmotaPayload(JSON.stringify({ POWER: 'ON', Wifi: { RSSI: 72 } }));
    expect(reading.output).toBe(true);
    expect(reading.powerWatts).toBeUndefined();
  });

  it('accepts an already-parsed object', () => {
    expect(parseTasmotaPayload({ ENERGY: { Power: 5 } }).powerWatts).toBe(5);
  });

  it('returns an empty reading for malformed JSON', () => {
    expect(parseTasmotaPayload('not json')).toEqual({});
  });

  it('ignores non-finite/absent fields', () => {
    const reading = parseTasmotaPayload(JSON.stringify({ ENERGY: { Power: 'x', Voltage: 120 } }));
    expect(reading.powerWatts).toBeUndefined();
    expect(reading.voltage).toBe(120);
    expect(reading.output).toBeUndefined();
  });
});

describe('tasmotaTopics', () => {
  it('derives the standard tele/stat/cmnd topics', () => {
    expect(tasmotaTopics('tasmota_plug')).toEqual({
      sensor: 'tele/tasmota_plug/SENSOR',
      state: 'tele/tasmota_plug/STATE',
      result: 'stat/tasmota_plug/RESULT',
      command: 'cmnd/tasmota_plug/POWER'
    });
  });

  it('trims stray slashes from the device topic', () => {
    expect(tasmotaTopics('/plug/').command).toBe('cmnd/plug/POWER');
  });
});
