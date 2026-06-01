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
  normalizeGen1Plug,
  normalizeGen2Switch,
  PlugReading,
  ShellyGen1PlugStatus,
  ShellyGen2SwitchStatus
} from './readings';

/** The detected Shelly plug generation. */
export type ShellyPlugVariant = 'gen2' | 'gen1';

/** Builds the base URL for a Shelly device from a host or IP. */
export function shellyPlugBaseUrl(host: string): string {
  return /^https?:\/\//i.test(host) ? host.replace(/\/$/, '') : `http://${host}`;
}

/**
 * Minimal HTTP client for Shelly smart plugs (metered relays) that auto-detects the device generation.
 *
 * Gen2 devices use `GET /rpc/Switch.GetStatus?id=<n>` and `GET /rpc/Switch.Set?id=<n>&on=<bool>`; Gen1 devices use `GET
 * /status` and `GET /relay/<n>?turn=on|off`. The variant is probed once (Gen2 → Gen1) and cached.
 */
export class ShellyPlugClient {
  private readonly baseUrl: string;
  private variant?: ShellyPlugVariant;

  /**
   * @param host - The Shelly hostname or IP (with or without scheme).
   * @param fetcher - The fetch implementation to use.
   * @param channelId - The switch/relay id to read and control (default 0).
   * @param timeoutMs - Per-request timeout in milliseconds.
   */
  constructor(
    host: string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly channelId: number = 0,
    private readonly timeoutMs: number = 10_000
  ) {
    this.baseUrl = shellyPlugBaseUrl(host);
  }

  /**
   * Performs a GET and parses JSON, returning `undefined` on any non-OK/parse/network error.
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
   * Detects the plug generation by probing Gen2 `Switch.GetStatus`, then Gen1 `/status`.
   *
   * @returns The detected variant.
   * @throws If no known Shelly plug endpoint responds.
   */
  async detectVariant(): Promise<ShellyPlugVariant> {
    if (this.variant) {
      return this.variant;
    }

    if (await this.tryGetJson<ShellyGen2SwitchStatus>(`/rpc/Switch.GetStatus?id=${this.channelId}`)) {
      this.variant = 'gen2';
    } else if (await this.tryGetJson<ShellyGen1PlugStatus>('/status')) {
      this.variant = 'gen1';
    } else {
      throw new Error('No Shelly plug endpoint responded (tried Switch.GetStatus and /status)');
    }

    return this.variant;
  }

  /**
   * Fetches and normalizes the current reading for the detected variant.
   *
   * @returns The normalized {@link PlugReading}.
   */
  async getReading(): Promise<PlugReading> {
    const variant = await this.detectVariant();

    if (variant === 'gen2') {
      const status = await this.tryGetJson<ShellyGen2SwitchStatus>(`/rpc/Switch.GetStatus?id=${this.channelId}`);
      if (!status) {
        throw new Error('Shelly Switch.GetStatus returned no data');
      }
      return normalizeGen2Switch(status);
    }

    const status = await this.tryGetJson<ShellyGen1PlugStatus>('/status');
    if (!status) {
      throw new Error('Shelly /status returned no data');
    }
    return normalizeGen1Plug(status);
  }

  /**
   * Turns the plug's relay on or off.
   *
   * @param on - The desired output state.
   * @throws If the request fails.
   */
  async setOutput(on: boolean): Promise<void> {
    const variant = await this.detectVariant();
    const path =
      variant === 'gen2'
        ? `/rpc/Switch.Set?id=${this.channelId}&on=${on}`
        : `/relay/${this.channelId}?turn=${on ? 'on' : 'off'}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(`${this.baseUrl}${path}`, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`Shelly set output failed with HTTP ${response.status}`);
      }
    } finally {
      clearTimeout(timer);
    }
  }
}
