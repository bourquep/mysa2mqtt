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

import { TeslaWallConnectorLifetime, TeslaWallConnectorVitals } from './vitals';

/** Builds the base URL for a Wall Connector from a host or IP. */
export function wallConnectorBaseUrl(host: string): string {
  return /^https?:\/\//i.test(host) ? host.replace(/\/$/, '') : `http://${host}`;
}

/**
 * Minimal HTTP client for the Tesla Wall Connector (Gen 3) local API.
 *
 * The API is unauthenticated and local; this client only performs GETs and parses JSON, with the `fetch` implementation
 * injectable for testing.
 */
export class TeslaWallConnectorClient {
  private readonly baseUrl: string;

  /**
   * @param host - The Wall Connector hostname or IP (with or without scheme).
   * @param fetcher - The fetch implementation to use.
   * @param timeoutMs - Per-request timeout in milliseconds.
   */
  constructor(
    host: string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly timeoutMs: number = 10_000
  ) {
    this.baseUrl = wallConnectorBaseUrl(host);
  }

  /**
   * Performs a GET against a Wall Connector path and parses the JSON response.
   *
   * @param path - The API path (e.g. `/api/1/vitals`).
   * @returns The parsed JSON.
   */
  private async getJson<T>(path: string): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(`${this.baseUrl}${path}`, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return (await response.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Fetches `GET /api/1/vitals`. */
  getVitals(): Promise<TeslaWallConnectorVitals> {
    return this.getJson<TeslaWallConnectorVitals>('/api/1/vitals');
  }

  /** Fetches `GET /api/1/lifetime`. */
  getLifetime(): Promise<TeslaWallConnectorLifetime> {
    return this.getJson<TeslaWallConnectorLifetime>('/api/1/lifetime');
  }
}
