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

import { EmporiaChannelReading, EmporiaDevice, parseEmporiaDevices, parseEmporiaUsages } from './usage';

/** The base URL of the Emporia cloud API. */
export const EMPORIA_API_BASE_URL = 'https://api.emporiaenergy.com';

/**
 * Provides a current Emporia ID token (Cognito), refreshing as needed. Supplied by the adapter so token management can
 * evolve independently of the HTTP client.
 */
export type EmporiaTokenProvider = () => Promise<string>;

/**
 * Minimal HTTP client for the Emporia Vue cloud API.
 *
 * Authorizes each request with the Cognito ID token in the `authtoken` header (as the official app does). The token
 * provider and `fetch` are injectable for testing.
 */
export class EmporiaClient {
  /**
   * @param getToken - Returns a current Emporia ID token.
   * @param fetcher - The fetch implementation to use.
   * @param baseUrl - The API base URL.
   * @param timeoutMs - Per-request timeout in milliseconds.
   */
  constructor(
    private readonly getToken: EmporiaTokenProvider,
    private readonly fetcher: typeof fetch = fetch,
    private readonly baseUrl: string = EMPORIA_API_BASE_URL,
    private readonly timeoutMs: number = 15_000
  ) {}

  /**
   * Performs an authorized GET and parses the JSON response.
   *
   * @param path - The request path (including query string).
   * @returns The parsed JSON.
   * @throws If the response is not OK.
   */
  private async getJson(path: string): Promise<unknown> {
    const token = await this.getToken();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(`${this.baseUrl}${path}`, {
        headers: { authtoken: token },
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(`Emporia request failed with HTTP ${response.status}`);
      }
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Fetches the account's devices and their channels.
   *
   * @returns The list of {@link EmporiaDevice}s.
   */
  async getDevices(): Promise<EmporiaDevice[]> {
    return parseEmporiaDevices(await this.getJson('/customers/devices'));
  }

  /**
   * Fetches the latest per-channel usage for the given devices, as average power (watts).
   *
   * @param deviceGids - The device global ids to query.
   * @param now - The reference instant (defaults to now); the API returns the most recent complete second before it.
   * @returns The per-channel power readings.
   */
  async getChannelPower(deviceGids: number[], now: Date = new Date()): Promise<EmporiaChannelReading[]> {
    const gids = deviceGids.join('+');
    const instant = now.toISOString();
    const path =
      `/AppAPI?apiMethod=getDeviceListUsages&deviceGids=${encodeURIComponent(gids)}` +
      `&instant=${encodeURIComponent(instant)}&scale=1S&energyUnit=KilowattHours`;
    return parseEmporiaUsages(await this.getJson(path));
  }
}
