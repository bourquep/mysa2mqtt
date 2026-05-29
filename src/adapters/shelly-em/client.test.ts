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

import { describe, expect, it, vi } from 'vitest';
import { ShellyEmClient, shellyBaseUrl } from './client';

/** Builds a fetch stub that returns 200+JSON for matching paths and 404 otherwise. */
function fetcherFor(routes: Record<string, unknown>): typeof fetch {
  return vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    const match = Object.keys(routes).find((path) => url.includes(path));
    if (match) {
      return { ok: true, status: 200, json: async () => routes[match] } as unknown as Response;
    }
    return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
  });
}

describe('shellyBaseUrl', () => {
  it('prefixes a bare host and trims trailing slash', () => {
    expect(shellyBaseUrl('192.168.1.7')).toBe('http://192.168.1.7');
    expect(shellyBaseUrl('http://shelly.local/')).toBe('http://shelly.local');
  });
});

describe('ShellyEmClient.detectVariant', () => {
  it('detects a Gen2 three-phase (EM) device', async () => {
    const client = new ShellyEmClient('host', fetcherFor({ '/rpc/EM.GetStatus': { total_act_power: 1 } }));
    expect(await client.detectVariant()).toBe('gen2-em');
  });

  it('detects a Gen2 single-phase (EM1) device', async () => {
    const client = new ShellyEmClient('host', fetcherFor({ '/rpc/EM1.GetStatus': { act_power: 1 } }));
    expect(await client.detectVariant()).toBe('gen2-em1');
  });

  it('detects a Gen1 device via /status', async () => {
    const client = new ShellyEmClient('host', fetcherFor({ '/status': { emeters: [] } }));
    expect(await client.detectVariant()).toBe('gen1');
  });

  it('throws when nothing responds', async () => {
    const client = new ShellyEmClient('host', fetcherFor({}));
    await expect(client.detectVariant()).rejects.toThrow('No Shelly energy-meter endpoint responded');
  });

  it('caches the detected variant (no re-probing)', async () => {
    const fetcher = fetcherFor({ '/rpc/EM.GetStatus': { total_act_power: 1 } });
    const client = new ShellyEmClient('host', fetcher);
    await client.detectVariant();
    const callsAfterFirst = (fetcher as ReturnType<typeof vi.fn>).mock.calls.length;
    await client.detectVariant();
    expect((fetcher as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterFirst);
  });
});

describe('ShellyEmClient.getReading', () => {
  it('reads and normalizes a Gen2 three-phase device (EM + EMData)', async () => {
    const client = new ShellyEmClient(
      'host',
      fetcherFor({
        '/rpc/EM.GetStatus': { total_act_power: 1500, a_voltage: 240 },
        '/rpc/EMData.GetStatus': { total_act: 9000 }
      })
    );
    const reading = await client.getReading();
    expect(reading.totalPowerWatts).toBe(1500);
    expect(reading.voltage).toBe(240);
    expect(reading.totalEnergyKwh).toBe(9);
  });

  it('reads a Gen1 device and sums its emeters', async () => {
    const client = new ShellyEmClient(
      'host',
      fetcherFor({
        '/status': {
          emeters: [
            { power: 100, total: 1000 },
            { power: 250, total: 2000 }
          ]
        }
      })
    );
    const reading = await client.getReading();
    expect(reading.totalPowerWatts).toBe(350);
    expect(reading.totalEnergyKwh).toBe(3);
  });

  it('still works for Gen2 three-phase when EMData is unavailable', async () => {
    const client = new ShellyEmClient('host', fetcherFor({ '/rpc/EM.GetStatus': { total_act_power: 42 } }));
    const reading = await client.getReading();
    expect(reading.totalPowerWatts).toBe(42);
    expect(reading.totalEnergyKwh).toBeUndefined();
  });
});
