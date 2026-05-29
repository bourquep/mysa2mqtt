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
import { extractEnergyKwh, fetchMysaDeviceEnergy, MYSA_API_BASE_URL } from './energy-api';

describe('fetchMysaDeviceEnergy', () => {
  it('POSTs the device energy endpoint with the ID token and the documented body', async () => {
    const json = { energyUsed: 1 };
    const fetcher = vi.fn<typeof fetch>(
      async () => ({ ok: true, status: 200, json: async () => json }) as unknown as Response
    );

    const result = await fetchMysaDeviceEnergy('dev-123', 'jwt-token', {
      fetcher,
      timezone: 'America/Vancouver',
      now: new Date('2026-02-01T00:00:00Z')
    });

    expect(result).toBe(json);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(`${MYSA_API_BASE_URL}/energy/device/dev-123`);
    expect(init).toMatchObject({
      method: 'POST',
      headers: { Authorization: 'jwt-token', 'Content-Type': 'application/json' }
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      PhoneTimezone: 'America/Vancouver',
      Scope: 'Day',
      Timestamp: 1769904000
    });
  });

  it('URL-encodes the device id', async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () => ({ ok: true, status: 200, json: async () => ({}) }) as unknown as Response
    );
    await fetchMysaDeviceEnergy('a/b c', 'jwt', { fetcher });
    expect(fetcher.mock.calls[0][0]).toBe(`${MYSA_API_BASE_URL}/energy/device/a%2Fb%20c`);
  });

  it('throws on a non-OK response', async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () => ({ ok: false, status: 401, json: async () => ({}) }) as unknown as Response
    );
    await expect(fetchMysaDeviceEnergy('dev-123', 'jwt', { fetcher })).rejects.toThrow('HTTP 401');
  });
});

describe('extractEnergyKwh', () => {
  it('finds a top-level kWh value', () => {
    expect(extractEnergyKwh({ kWh: 12.5 })).toBe(12.5);
  });

  it('finds a nested value and prefers kWh over generic energy keys', () => {
    expect(extractEnergyKwh({ data: { totalKwh: 3, energy: 999 } })).toBe(3);
  });

  it('falls back to energy / consumption / usage keys', () => {
    expect(extractEnergyKwh({ energy: 4 })).toBe(4);
    expect(extractEnergyKwh({ consumption: 7 })).toBe(7);
    expect(extractEnergyKwh({ usage: 9 })).toBe(9);
  });

  it('ignores non-finite values', () => {
    expect(extractEnergyKwh({ kWh: Number.NaN, energy: 5 })).toBe(5);
  });

  it('returns null when nothing looks like energy', () => {
    expect(extractEnergyKwh({ foo: 'bar', temperature: 21 })).toBeNull();
    expect(extractEnergyKwh(null)).toBeNull();
    expect(extractEnergyKwh(42)).toBeNull();
  });

  it('returns null when the most specific matches disagree (ambiguous)', () => {
    expect(extractEnergyKwh([{ kWh: 1 }, { kWh: 2 }])).toBeNull();
  });

  it('accepts agreeing duplicate matches', () => {
    expect(extractEnergyKwh([{ kWh: 2 }, { kWh: 2 }])).toBe(2);
  });
});
