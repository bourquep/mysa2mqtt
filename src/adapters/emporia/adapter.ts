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

import { DeviceConfiguration, MqttSettings, OriginConfiguration } from 'mqtt2ha';
import pino from 'pino';
import { SourceAdapter } from '../../bridge/types';
import { PowerEnergyPublisher } from '../../energy/power-energy-publisher';
import { PinoLogger } from '../../logger';
import { version } from '../../version';
import { EmporiaClient, EmporiaTokenProvider } from './client';
import { EmporiaDevice } from './usage';

/** Default interval, in milliseconds, between Emporia usage polls. */
const DEFAULT_REFRESH_INTERVAL_MS = 30_000;

/** Configuration required by the {@link EmporiaAdapter}. */
export interface EmporiaConfig {
  /** Returns a current Emporia (Cognito) ID token. */
  getToken: EmporiaTokenProvider;
  /** Optional electricity rate per kWh; when set, each channel publishes a cost sensor. */
  costPerKwh?: number;
  /** Currency symbol for cost sensors (only used when `costPerKwh` is set). */
  currency?: string;
}

/**
 * Bridges an Emporia Vue whole-home energy monitor to MQTT / Home Assistant.
 *
 * Emporia Vue measures the mains plus up to 16 individual circuits, so this adapter is squarely on the project's
 * energy-usage mission. It polls the Emporia cloud API for per-channel usage and publishes a power + energy (+ optional
 * cost) trio per channel via the shared {@link PowerEnergyPublisher}. Every entity is energy data, so the adapter is
 * unaffected by the energy-only safety switch.
 */
export class EmporiaAdapter implements SourceAdapter {
  readonly id = 'emporia';
  readonly displayName = 'Emporia Vue';

  private readonly client: EmporiaClient;

  private readonly origin: OriginConfiguration = {
    name: 'mysa2mqtt',
    sw_version: version,
    support_url: 'https://github.com/bourquep/mysa2mqtt'
  };

  private devices: EmporiaDevice[] = [];
  /** Per-channel publishers, keyed by `<deviceGid>:<channelNum>`. */
  private readonly publishers = new Map<string, PowerEnergyPublisher>();
  private timer?: NodeJS.Timeout;

  /**
   * @param config - Emporia account configuration.
   * @param mqttSettings - Shared MQTT connection settings.
   * @param logger - Logger scoped to this adapter.
   * @param refreshIntervalMs - How often to poll, in milliseconds.
   * @param fetcher - The fetch implementation to use (injectable for testing).
   */
  constructor(
    private readonly config: EmporiaConfig,
    private readonly mqttSettings: MqttSettings,
    private readonly logger: pino.Logger,
    private readonly refreshIntervalMs: number = DEFAULT_REFRESH_INTERVAL_MS,
    fetcher: typeof fetch = fetch
  ) {
    this.client = new EmporiaClient(config.getToken, fetcher);
  }

  /** Discovers devices/channels, registers a power+energy trio per channel, and starts polling. */
  async start(): Promise<void> {
    this.devices = await this.client.getDevices();
    const channelCount = this.devices.reduce((total, device) => total + device.channels.length, 0);
    this.logger.info(`Discovered ${this.devices.length} Emporia device(s) with ${channelCount} channel(s).`);

    for (const device of this.devices) {
      for (const channel of device.channels) {
        const publisher = this.publisherFor(device, channel.channelNum, channel.name);
        await publisher.writeConfig();
      }
    }

    await this.poll();

    this.timer = setInterval(() => {
      this.poll().catch((error) => this.logger.error(error, 'Failed to poll Emporia'));
    }, this.refreshIntervalMs);
    // Don't let the poll timer keep the process alive on its own.
    this.timer.unref();

    this.logger.info(`Polling Emporia every ${Math.round(this.refreshIntervalMs / 1000)}s.`);
  }

  /**
   * Returns (creating if needed) the power+energy publisher for a device channel.
   *
   * @param device - The owning device.
   * @param channelNum - The channel identifier.
   * @param channelName - The channel's display name, if any.
   * @returns The channel's publisher.
   */
  private publisherFor(device: EmporiaDevice, channelNum: string, channelName?: string): PowerEnergyPublisher {
    const key = `${device.deviceGid}:${channelNum}`;
    const existing = this.publishers.get(key);
    if (existing) {
      return existing;
    }

    const safeChannel = channelNum.replace(/[^a-zA-Z0-9]/g, '_');
    const identifier = `emporia_${device.deviceGid}_${safeChannel}`;
    const isMains = channelNum.includes(',');
    const label = channelName?.trim() || (isMains ? 'Mains' : `Circuit ${channelNum}`);

    const mqttDevice: DeviceConfiguration = {
      identifiers: `emporia_${device.deviceGid}`,
      name: device.name ?? `Emporia ${device.deviceGid}`,
      manufacturer: 'Emporia',
      model: 'Vue'
    };

    const publisher = new PowerEnergyPublisher({
      mqtt: this.mqttSettings,
      logger: new PinoLogger(this.logger.child({ module: 'emporia', channel: key })),
      device: mqttDevice,
      origin: this.origin,
      uniqueIdPrefix: identifier,
      namePrefix: label,
      costPerKwh: this.config.costPerKwh,
      currency: this.config.currency
    });
    this.publishers.set(key, publisher);
    return publisher;
  }

  /** Fetches the latest per-channel usage and publishes each channel's power (energy is derived by integration). */
  private async poll(): Promise<void> {
    if (this.devices.length === 0) {
      return;
    }

    const readings = await this.client.getChannelPower(this.devices.map((device) => device.deviceGid));
    const now = Date.now();

    for (const reading of readings) {
      const key = `${reading.deviceGid}:${reading.channelNum}`;
      const publisher = this.publishers.get(key);
      // Emporia gives per-second usage → average power; integrate it for cumulative energy and cost.
      await publisher?.updatePower(reading.powerWatts, now);
    }
  }

  /** Stops the poll timer and marks all channel entities unavailable. */
  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }

    await Promise.all(Array.from(this.publishers.values()).map((publisher) => publisher.setUnavailable()));
  }
}
