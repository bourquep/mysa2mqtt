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
import { TeslaWallConnectorClient, wallConnectorBaseUrl } from './client';

describe('wallConnectorBaseUrl', () => {
  it('prefixes a bare host/IP with http://', () => {
    expect(wallConnectorBaseUrl('192.168.1.50')).toBe('http://192.168.1.50');
    expect(wallConnectorBaseUrl('teslawall.local')).toBe('http://teslawall.local');
  });

  it('preserves an explicit scheme and trims a trailing slash', () => {
    expect(wallConnectorBaseUrl('https://192.168.1.50/')).toBe('https://192.168.1.50');
    expect(wallConnectorBaseUrl('http://teslawall.local')).toBe('http://teslawall.local');
  });
});

describe('TeslaWallConnectorClient', () => {
  it('GETs /api/1/vitals against the resolved base URL', async () => {
    const vitals = { vehicle_connected: true };
    const fetcher = vi.fn<typeof fetch>(
      async () => ({ ok: true, status: 200, json: async () => vitals }) as unknown as Response
    );

    const client = new TeslaWallConnectorClient('192.168.1.50', fetcher);
    const result = await client.getVitals();

    expect(result).toBe(vitals);
    expect(fetcher.mock.calls[0][0]).toBe('http://192.168.1.50/api/1/vitals');
  });

  it('GETs /api/1/lifetime', async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () => ({ ok: true, status: 200, json: async () => ({ energy_wh: 1 }) }) as unknown as Response
    );
    const client = new TeslaWallConnectorClient('host', fetcher);
    await client.getLifetime();
    expect(fetcher.mock.calls[0][0]).toBe('http://host/api/1/lifetime');
  });

  it('throws on a non-OK response', async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () => ({ ok: false, status: 503, json: async () => ({}) }) as unknown as Response
    );
    const client = new TeslaWallConnectorClient('host', fetcher);
    await expect(client.getVitals()).rejects.toThrow('HTTP 503');
  });

  it('passes an abort signal (request timeout)', async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () => ({ ok: true, status: 200, json: async () => ({}) }) as unknown as Response
    );
    const client = new TeslaWallConnectorClient('host', fetcher);
    await client.getVitals();
    const init = fetcher.mock.calls[0][1];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
});
