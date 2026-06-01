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
import { EMPORIA_API_BASE_URL, EmporiaClient } from './client';

describe('EmporiaClient', () => {
  it('sends the ID token in the authtoken header and parses devices', async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({ devices: [{ deviceGid: 9, channels: [{ channelNum: '1' }] }] })
        }) as unknown as Response
    );
    const client = new EmporiaClient(async () => 'tok-123', fetcher);

    const devices = await client.getDevices();

    expect(devices).toHaveLength(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(`${EMPORIA_API_BASE_URL}/customers/devices`);
    expect((init?.headers as Record<string, string>).authtoken).toBe('tok-123');
  });

  it('builds the getDeviceListUsages query and returns per-channel watts', async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({
            deviceListUsages: {
              devices: [{ deviceGid: 9, channelUsages: [{ deviceGid: 9, channelNum: '1', usage: 0.5 / 3600 }] }]
            }
          })
        }) as unknown as Response
    );
    const client = new EmporiaClient(async () => 'tok', fetcher);

    const readings = await client.getChannelPower([9, 10], new Date('2026-06-01T00:00:00.000Z'));

    expect(readings[0].powerWatts).toBeCloseTo(500, 3);
    const url = String(fetcher.mock.calls[0][0]);
    expect(url).toContain('apiMethod=getDeviceListUsages');
    expect(url).toContain('deviceGids=9%2B10'); // "9+10" url-encoded
    expect(url).toContain('scale=1S');
    expect(url).toContain('energyUnit=KilowattHours');
    expect(url).toContain('instant=2026-06-01T00%3A00%3A00.000Z');
  });

  it('throws on a non-OK response', async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () => ({ ok: false, status: 401, json: async () => ({}) }) as unknown as Response
    );
    const client = new EmporiaClient(async () => 'tok', fetcher);
    await expect(client.getDevices()).rejects.toThrow('HTTP 401');
  });
});
