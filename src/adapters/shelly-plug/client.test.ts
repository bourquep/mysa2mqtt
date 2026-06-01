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
import { ShellyPlugClient } from './client';

/** Builds a fetch stub that returns 200+JSON for matching paths and 404 otherwise, recording calls. */
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

describe('ShellyPlugClient.detectVariant', () => {
  it('detects a Gen2 plug via Switch.GetStatus', async () => {
    const client = new ShellyPlugClient('host', fetcherFor({ '/rpc/Switch.GetStatus': { output: true } }));
    expect(await client.detectVariant()).toBe('gen2');
  });

  it('detects a Gen1 plug via /status', async () => {
    const client = new ShellyPlugClient('host', fetcherFor({ '/status': { relays: [{ ison: true }] } }));
    expect(await client.detectVariant()).toBe('gen1');
  });

  it('throws when nothing responds', async () => {
    const client = new ShellyPlugClient('host', fetcherFor({}));
    await expect(client.detectVariant()).rejects.toThrow('No Shelly plug endpoint responded');
  });
});

describe('ShellyPlugClient.getReading', () => {
  it('reads a Gen2 plug', async () => {
    const client = new ShellyPlugClient(
      'host',
      fetcherFor({ '/rpc/Switch.GetStatus': { output: true, apower: 100, aenergy: { total: 1000 } } })
    );
    const reading = await client.getReading();
    expect(reading.output).toBe(true);
    expect(reading.powerWatts).toBe(100);
    expect(reading.totalEnergyKwh).toBe(1);
  });

  it('reads a Gen1 plug', async () => {
    const client = new ShellyPlugClient(
      'host',
      fetcherFor({ '/status': { relays: [{ ison: false }], meters: [{ power: 0, total: 0 }] } })
    );
    const reading = await client.getReading();
    expect(reading.output).toBe(false);
    expect(reading.powerWatts).toBe(0);
  });
});

describe('ShellyPlugClient.setOutput', () => {
  it('uses the Gen2 Switch.Set endpoint with the boolean state', async () => {
    const fetcher = fetcherFor({ '/rpc/Switch.GetStatus': { output: false }, '/rpc/Switch.Set': {} });
    const client = new ShellyPlugClient('host', fetcher, 0);
    await client.setOutput(true);
    const setCall = (fetcher as ReturnType<typeof vi.fn>).mock.calls.find((c) => String(c[0]).includes('Switch.Set'));
    expect(String(setCall?.[0])).toBe('http://host/rpc/Switch.Set?id=0&on=true');
  });

  it('uses the Gen1 relay endpoint with turn=on/off', async () => {
    const fetcher = fetcherFor({ '/status': { relays: [{ ison: true }] }, '/relay/0': {} });
    const client = new ShellyPlugClient('host', fetcher, 0);
    await client.setOutput(false);
    const setCall = (fetcher as ReturnType<typeof vi.fn>).mock.calls.find((c) => String(c[0]).includes('/relay/0'));
    expect(String(setCall?.[0])).toBe('http://host/relay/0?turn=off');
  });

  it('throws when the set request fails', async () => {
    // Switch.GetStatus succeeds (detect gen2) but Switch.Set 404s.
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const ok = String(input).includes('Switch.GetStatus');
      return { ok, status: ok ? 200 : 500, json: async () => ({}) } as unknown as Response;
    });
    const client = new ShellyPlugClient('host', fetcher);
    await expect(client.setOutput(true)).rejects.toThrow('HTTP 500');
  });
});
