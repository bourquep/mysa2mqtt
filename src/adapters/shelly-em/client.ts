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

import {
  EnergyMeterReading,
  normalizeGen1,
  normalizeGen2Em,
  normalizeGen2Em1,
  ShellyGen1Status,
  ShellyGen2Em1DataStatus,
  ShellyGen2Em1Status,
  ShellyGen2EmDataStatus,
  ShellyGen2EmStatus
} from './readings';

/** The detected Shelly meter variant. */
export type ShellyVariant = 'gen2-em' | 'gen2-em1' | 'gen1';

/** Builds the base URL for a Shelly device from a host or IP. */
export function shellyBaseUrl(host: string): string {
  return /^https?:\/\//i.test(host) ? host.replace(/\/$/, '') : `http://${host}`;
}

/**
 * Minimal HTTP client for Shelly energy meters that auto-detects the device generation.
 *
 * Gen2 devices expose a JSON-RPC-style `GET /rpc/<Method>?id=<n>`; Gen1 devices expose `GET /status`. The variant is
 * probed once (Gen2 three-phase → single-phase → Gen1) and then cached.
 */
export class ShellyEmClient {
  private readonly baseUrl: string;
  private variant?: ShellyVariant;

  /**
   * @param host - The Shelly hostname or IP (with or without scheme).
   * @param fetcher - The fetch implementation to use.
   * @param channelId - The EM/EM1 component id to read (default 0).
   * @param timeoutMs - Per-request timeout in milliseconds.
   */
  constructor(
    host: string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly channelId: number = 0,
    private readonly timeoutMs: number = 10_000
  ) {
    this.baseUrl = shellyBaseUrl(host);
  }

  /**
   * Performs a GET and parses JSON, returning `undefined` on any non-OK/parse/network error (callers probe optional
   * endpoints, so a miss should not throw).
   *
   * @param path - The request path.
   * @returns The parsed JSON, or `undefined`.
   */
  private async tryGetJson<T>(path: string): Promise<T | undefined> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(`${this.baseUrl}${path}`, { signal: controller.signal });
      if (!response.ok) {
        return undefined;
      }
      return (await response.json()) as T;
    } catch {
      return undefined;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Detects the device variant by probing, in order: Gen2 `EM`, Gen2 `EM1`, then Gen1 `/status`.
   *
   * @returns The detected variant.
   * @throws If no known Shelly energy-meter endpoint responds.
   */
  async detectVariant(): Promise<ShellyVariant> {
    if (this.variant) {
      return this.variant;
    }

    if (await this.tryGetJson<ShellyGen2EmStatus>(`/rpc/EM.GetStatus?id=${this.channelId}`)) {
      this.variant = 'gen2-em';
    } else if (await this.tryGetJson<ShellyGen2Em1Status>(`/rpc/EM1.GetStatus?id=${this.channelId}`)) {
      this.variant = 'gen2-em1';
    } else if (await this.tryGetJson<ShellyGen1Status>('/status')) {
      this.variant = 'gen1';
    } else {
      throw new Error('No Shelly energy-meter endpoint responded (tried EM, EM1, and /status)');
    }

    return this.variant;
  }

  /**
   * Fetches and normalizes the current reading for the detected variant.
   *
   * @returns The normalized {@link EnergyMeterReading}.
   */
  async getReading(): Promise<EnergyMeterReading> {
    const variant = await this.detectVariant();

    if (variant === 'gen2-em') {
      const em = await this.tryGetJson<ShellyGen2EmStatus>(`/rpc/EM.GetStatus?id=${this.channelId}`);
      const emData = await this.tryGetJson<ShellyGen2EmDataStatus>(`/rpc/EMData.GetStatus?id=${this.channelId}`);
      if (!em) {
        throw new Error('Shelly EM.GetStatus returned no data');
      }
      return normalizeGen2Em(em, emData);
    }

    if (variant === 'gen2-em1') {
      const em1 = await this.tryGetJson<ShellyGen2Em1Status>(`/rpc/EM1.GetStatus?id=${this.channelId}`);
      const em1Data = await this.tryGetJson<ShellyGen2Em1DataStatus>(`/rpc/EM1Data.GetStatus?id=${this.channelId}`);
      if (!em1) {
        throw new Error('Shelly EM1.GetStatus returned no data');
      }
      return normalizeGen2Em1(em1, em1Data);
    }

    const status = await this.tryGetJson<ShellyGen1Status>('/status');
    if (!status) {
      throw new Error('Shelly /status returned no data');
    }
    return normalizeGen1(status);
  }
}
