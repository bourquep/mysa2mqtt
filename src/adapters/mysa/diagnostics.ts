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

import { writeFile as fsWriteFile } from 'fs/promises';
import { MYSA_API_BASE_URL, MYSA_BACKEND_URL, resolveHostTimezone } from './energy-api';

/**
 * Local diagnostics for the Mysa adapter.
 *
 * When enabled, this probes the known and candidate Mysa REST endpoints and captures a sample of raw realtime messages,
 * then writes a **redacted** report to a local file. It is meant to surface the response shapes this project hasn't
 * been able to confirm yet (e.g. the `/energy/device` schema, per-model realtime payloads), so they can be reviewed and
 * used to refine the integration.
 *
 * The report is written to disk only — nothing is transmitted anywhere. Identifiers and obvious personal information
 * are redacted, but the output should still be reviewed before sharing.
 */

/** Keys whose values are always redacted (case-insensitive substring match). */
const SENSITIVE_KEY_SUBSTRINGS = [
  'token',
  'password',
  'secret',
  'authorization',
  'credential',
  'apikey',
  'api_key',
  'email',
  'phone',
  'address',
  'ssid',
  'latitude',
  'longitude',
  'postal',
  'zipcode',
  'firstname',
  'lastname'
];

/** Matches a JWT-like string (three base64url segments). */
const JWT_PATTERN = /^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/;

/** Matches an email address. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The placeholder substituted for redacted values. */
export const REDACTED = '***redacted***';

/**
 * Deep-clones a value with sensitive data redacted.
 *
 * Values are redacted when their key looks sensitive (see {@link SENSITIVE_KEY_SUBSTRINGS}) or when a string value looks
 * like a JWT or an email address. Structure (keys, array lengths, types) is preserved so the shape remains useful.
 *
 * @param value - The value to redact.
 * @returns A redacted deep copy of the value.
 */
export function redactSensitive(value: unknown): unknown {
  if (typeof value === 'string') {
    return JWT_PATTERN.test(value) || EMAIL_PATTERN.test(value) ? REDACTED : value;
  }

  if (Array.isArray(value)) {
    return value.map(redactSensitive);
  }

  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      const lowerKey = key.toLowerCase();
      result[key] = SENSITIVE_KEY_SUBSTRINGS.some((substring) => lowerKey.includes(substring))
        ? REDACTED
        : redactSensitive(entry);
    }
    return result;
  }

  return value;
}

/** A single endpoint to probe. */
export interface EndpointProbe {
  /** A short label for the probe. */
  name: string;
  /** The HTTP method. */
  method: 'GET' | 'POST';
  /** The full request URL. */
  url: string;
  /** An optional JSON request body. */
  body?: unknown;
}

/** The (redacted) result of probing an endpoint. */
export interface ProbeResult {
  name: string;
  method: string;
  url: string;
  ok: boolean;
  status: number;
  body?: unknown;
  error?: string;
}

/** The diagnostics report written to disk. */
export interface DiagnosticsReport {
  generatedAt: string;
  note: string;
  endpoints: ProbeResult[];
  realtimeMessages: unknown[];
}

/** Options and injectable dependencies for {@link runMysaDiagnostics}. */
export interface DiagnosticsOptions {
  /** The Cognito ID-token JWT used to authorize requests. */
  idToken: string;
  /** The device identifiers to probe per-device endpoints for. */
  deviceIds: string[];
  /** The fetch implementation to use (injectable for testing). */
  fetcher?: typeof fetch;
  /** Writes the report file (injectable for testing). */
  writeFile?: (path: string, data: string) => Promise<void>;
  /** Subscribes to raw realtime messages; returns an unsubscribe function. Omit to skip realtime capture. */
  subscribeRaw?: (handler: (message: unknown) => void) => () => void;
  /** How long to capture realtime messages, in milliseconds. */
  captureMs?: number;
  /** The maximum number of realtime messages to capture. */
  maxMessages?: number;
  /** Reference time for time-based request fields. */
  now?: Date;
}

/**
 * Builds the list of endpoints to probe for diagnostics.
 *
 * @param deviceIds - The device identifiers to include per-device probes for.
 * @param now - Reference time used for the energy request body.
 * @returns The endpoint probes.
 */
export function buildMysaProbes(deviceIds: string[], now: Date = new Date()): EndpointProbe[] {
  const energyBody = {
    PhoneTimezone: resolveHostTimezone(),
    Scope: 'Day',
    Timestamp: Math.floor(now.getTime() / 1000)
  };

  const probes: EndpointProbe[] = [
    { name: 'devices', method: 'GET', url: `${MYSA_API_BASE_URL}/devices` },
    { name: 'devices/state', method: 'GET', url: `${MYSA_API_BASE_URL}/devices/state` },
    { name: 'users', method: 'GET', url: `${MYSA_API_BASE_URL}/users` },
    { name: 'backend:users', method: 'GET', url: `${MYSA_BACKEND_URL}/users` }
  ];

  for (const deviceId of deviceIds) {
    const id = encodeURIComponent(deviceId);
    probes.push({
      name: `energy/device/${deviceId}`,
      method: 'POST',
      url: `${MYSA_API_BASE_URL}/energy/device/${id}`,
      body: energyBody
    });
    probes.push({
      name: `energy/setpoints/device/${deviceId}`,
      method: 'POST',
      url: `${MYSA_API_BASE_URL}/energy/setpoints/device/${id}`,
      body: energyBody
    });
    probes.push({
      name: `backend:telemetry/usage/${deviceId}`,
      method: 'GET',
      url: `${MYSA_BACKEND_URL}/telemetry/usage/${id}`
    });
  }

  return probes;
}

/**
 * Probes a single endpoint, returning a redacted result and never throwing.
 *
 * @param probe - The endpoint to probe.
 * @param idToken - The Cognito ID-token JWT.
 * @param fetcher - The fetch implementation to use.
 * @returns The redacted probe result.
 */
export async function probeEndpoint(
  probe: EndpointProbe,
  idToken: string,
  fetcher: typeof fetch = fetch
): Promise<ProbeResult> {
  try {
    const response = await fetcher(probe.url, {
      method: probe.method,
      headers: { Authorization: idToken, 'Content-Type': 'application/json' },
      ...(probe.body !== undefined ? { body: JSON.stringify(probe.body) } : {})
    });

    let body: unknown;
    try {
      body = redactSensitive(await response.json());
    } catch {
      body = undefined;
    }

    return { name: probe.name, method: probe.method, url: probe.url, ok: response.ok, status: response.status, body };
  } catch (error) {
    return {
      name: probe.name,
      method: probe.method,
      url: probe.url,
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Captures up to `maxMessages` raw realtime messages, or until `captureMs` elapses.
 *
 * @param subscribeRaw - Subscribes to raw messages; returns an unsubscribe function.
 * @param captureMs - Maximum capture duration in milliseconds.
 * @param maxMessages - Maximum number of messages to capture.
 * @returns The captured, redacted messages.
 */
function captureRealtimeMessages(
  subscribeRaw: (handler: (message: unknown) => void) => () => void,
  captureMs: number,
  maxMessages: number
): Promise<unknown[]> {
  return new Promise((resolve) => {
    const messages: unknown[] = [];
    let settled = false;

    const finish = (unsubscribe: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      unsubscribe();
      clearTimeout(timer);
      resolve(messages);
    };

    const unsubscribe = subscribeRaw((message) => {
      if (messages.length < maxMessages) {
        messages.push(redactSensitive(message));
      }
      if (messages.length >= maxMessages) {
        finish(unsubscribe);
      }
    });

    const timer = setTimeout(() => finish(unsubscribe), captureMs);
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
  });
}

/**
 * Runs the Mysa diagnostics: probes endpoints, captures a sample of realtime messages, and writes a redacted report.
 *
 * @param filePath - Where to write the report.
 * @param options - Diagnostics options and injectable dependencies.
 * @returns The report that was written.
 */
export async function runMysaDiagnostics(filePath: string, options: DiagnosticsOptions): Promise<DiagnosticsReport> {
  const {
    idToken,
    deviceIds,
    fetcher = fetch,
    writeFile = fsWriteFile,
    subscribeRaw,
    captureMs = 30_000,
    maxMessages = 25,
    now = new Date()
  } = options;

  const endpoints: ProbeResult[] = [];
  for (const probe of buildMysaProbes(deviceIds, now)) {
    endpoints.push(await probeEndpoint(probe, idToken, fetcher));
  }

  const realtimeMessages = subscribeRaw ? await captureRealtimeMessages(subscribeRaw, captureMs, maxMessages) : [];

  const report: DiagnosticsReport = {
    generatedAt: new Date().toISOString(),
    note: 'Generated locally by mysa2mqtt --mysa-diagnostics. Identifiers/secrets are redacted; review before sharing.',
    endpoints,
    realtimeMessages
  };

  await writeFile(filePath, JSON.stringify(report, null, 2));
  return report;
}
