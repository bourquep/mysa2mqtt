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
import {
  buildMysaProbes,
  DiagnosticsReport,
  probeEndpoint,
  REDACTED,
  redactSensitive,
  runMysaDiagnostics
} from './diagnostics';
import { MYSA_API_BASE_URL, MYSA_BACKEND_URL } from './energy-api';

const JWT = 'aaaaaaaa.bbbbbbbb.cccccccc';

describe('redactSensitive', () => {
  it('redacts values of sensitive keys but keeps structure', () => {
    const redacted = redactSensitive({
      accessToken: 'x',
      refreshToken: 'y',
      Email: 'a@b.com',
      Name: 'keep-me',
      SetPoint: 21
    }) as Record<string, unknown>;

    expect(redacted.accessToken).toBe(REDACTED);
    expect(redacted.refreshToken).toBe(REDACTED);
    expect(redacted.Email).toBe(REDACTED);
    expect(redacted.SetPoint).toBe(21);
    // `Name` is not in the sensitive key list, so it is preserved.
    expect(redacted.Name).toBe('keep-me');
  });

  it('redacts JWT-like and email-like string values regardless of key', () => {
    const redacted = redactSensitive({ note: JWT, contact: 'user@example.com', plain: 'hello' }) as Record<
      string,
      unknown
    >;
    expect(redacted.note).toBe(REDACTED);
    expect(redacted.contact).toBe(REDACTED);
    expect(redacted.plain).toBe('hello');
  });

  it('recurses into arrays and nested objects', () => {
    const redacted = redactSensitive({ list: [{ password: 'p', ok: 1 }], nested: { authorization: 'z', v: 2 } }) as {
      list: Record<string, unknown>[];
      nested: Record<string, unknown>;
    };
    expect(redacted.list[0].password).toBe(REDACTED);
    expect(redacted.list[0].ok).toBe(1);
    expect(redacted.nested.authorization).toBe(REDACTED);
    expect(redacted.nested.v).toBe(2);
  });

  it('passes through primitives', () => {
    expect(redactSensitive(5)).toBe(5);
    expect(redactSensitive('plain')).toBe('plain');
    expect(redactSensitive(null)).toBeNull();
  });
});

describe('buildMysaProbes', () => {
  it('includes account-level and per-device probes', () => {
    const probes = buildMysaProbes(['dev1'], new Date('2026-02-01T00:00:00Z'));
    const byName = Object.fromEntries(probes.map((probe) => [probe.name, probe]));

    expect(byName['devices'].url).toBe(`${MYSA_API_BASE_URL}/devices`);
    expect(byName['backend:users'].url).toBe(`${MYSA_BACKEND_URL}/users`);
    expect(byName['energy/device/dev1']).toMatchObject({
      method: 'POST',
      url: `${MYSA_API_BASE_URL}/energy/device/dev1`
    });
    expect(byName['energy/device/dev1'].body).toMatchObject({ Scope: 'Day', Timestamp: 1769904000 });
    expect(byName['backend:telemetry/usage/dev1'].url).toBe(`${MYSA_BACKEND_URL}/telemetry/usage/dev1`);
  });
});

describe('probeEndpoint', () => {
  it('sends the auth header and redacts the response body', async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () => ({ ok: true, status: 200, json: async () => ({ AccessToken: 'x', value: 1 }) }) as unknown as Response
    );

    const result = await probeEndpoint(
      { name: 'devices', method: 'GET', url: `${MYSA_API_BASE_URL}/devices` },
      'jwt',
      fetcher
    );

    expect(result).toMatchObject({ ok: true, status: 200 });
    expect(result.body).toEqual({ AccessToken: REDACTED, value: 1 });
    expect(fetcher.mock.calls[0][1]).toMatchObject({ method: 'GET', headers: { Authorization: 'jwt' } });
  });

  it('captures non-OK responses without throwing', async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () => ({ ok: false, status: 401, json: async () => ({}) }) as unknown as Response
    );
    const result = await probeEndpoint({ name: 'users', method: 'GET', url: 'https://x/users' }, 'jwt', fetcher);
    expect(result).toMatchObject({ ok: false, status: 401 });
  });

  it('captures network errors without throwing', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => {
      throw new Error('boom');
    });
    const result = await probeEndpoint({ name: 'users', method: 'GET', url: 'https://x/users' }, 'jwt', fetcher);
    expect(result).toMatchObject({ ok: false, status: 0, error: 'boom' });
  });
});

describe('runMysaDiagnostics', () => {
  it('probes endpoints, captures realtime messages, and writes a redacted report', async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () => ({ ok: true, status: 200, json: async () => ({ ok: 1 }) }) as unknown as Response
    );
    let written: { path: string; data: string } | undefined;
    const writeFile = async (path: string, data: string) => {
      written = { path, data };
    };
    const subscribeRaw = (handler: (message: unknown) => void) => {
      queueMicrotask(() => {
        handler({ Authorization: JWT, body: { ambTemp: 20 } });
        handler({ body: { dtyCycle: 1 } });
      });
      return () => {};
    };

    const report = await runMysaDiagnostics('/tmp/report.json', {
      idToken: 'jwt',
      deviceIds: ['dev1'],
      fetcher,
      writeFile,
      subscribeRaw,
      maxMessages: 2,
      captureMs: 1000
    });

    // 4 account-level probes + 3 per-device probes.
    expect(report.endpoints).toHaveLength(7);
    expect(report.realtimeMessages).toHaveLength(2);
    // The Authorization field in the captured message is redacted.
    expect((report.realtimeMessages[0] as Record<string, unknown>).Authorization).toBe(REDACTED);

    expect(written?.path).toBe('/tmp/report.json');
    const parsed = JSON.parse(written?.data ?? '{}') as DiagnosticsReport;
    expect(parsed.endpoints).toHaveLength(7);
  });
});
